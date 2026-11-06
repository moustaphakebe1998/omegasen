/**
 * Client API typé (types générés depuis l'OpenAPI de FastAPI : `npm run api:types`).
 *
 * - Ajoute le jeton d'accès (en mémoire uniquement, jamais en localStorage).
 * - Sur 401, tente UNE fois de rafraîchir la session via le cookie httpOnly puis rejoue la requête.
 * - Toutes les erreurs API sont converties en `ApiError` (code + message en français).
 */
import createClient, { type Middleware } from "openapi-fetch";

import type { components, paths } from "./schema";

export type Schemas = components["schemas"];

let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;
let onSessionLost: (() => void) | null = null;
let onAccessChanged: (() => void) | null = null;
let sessionBlock: { code: string; message: string } | null = null;

/** Codes renvoyés quand le statut d'un restaurant bloque l'accès (app/core/access.py). */
export const ACCESS_BLOCK_CODES = new Set(["restaurant_suspended", "restaurant_closed", "restaurant_pending"]);

/** Rappel déclenché quand les droits ont changé (statut du restaurant, rôle, permissions) : recharger le profil. */
export function setOnAccessChanged(cb: (() => void) | null) {
  onAccessChanged = cb;
}

export function notifyAccessChanged() {
  onAccessChanged?.();
}

/** Motif du dernier refus de session (ex. restaurant suspendu), à afficher sur la page de connexion. */
export function lastSessionBlock() {
  return sessionBlock;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function setOnSessionLost(cb: (() => void) | null) {
  onSessionLost = cb;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type ErrorBody = { error?: { code?: string; message?: string; details?: unknown } };

export async function toApiError(res: Response): Promise<ApiError> {
  let body: ErrorBody = {};
  try {
    body = await res.clone().json();
  } catch {
    /* corps non JSON */
  }
  return new ApiError(
    res.status,
    body.error?.code ?? "http_error",
    body.error?.message ?? (res.status >= 500 ? "Erreur serveur, réessayez." : "Requête refusée"),
    body.error?.details,
  );
}

/** Rafraîchit la session (un seul appel concurrent). Retourne le nouveau jeton ou null. */
export async function refreshSession(): Promise<Schemas["TokenOut"] | null> {
  const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
  if (!res.ok) {
    const err = await toApiError(res);
    sessionBlock = ACCESS_BLOCK_CODES.has(err.code) ? { code: err.code, message: err.message } : null;
    return null;
  }
  sessionBlock = null;
  const data = (await res.json()) as Schemas["TokenOut"];
  accessToken = data.access_token;
  return data;
}

async function refreshOnce(): Promise<string | null> {
  if (!refreshing) {
    refreshing = refreshSession()
      .then((d) => d?.access_token ?? null)
      .finally(() => {
        setTimeout(() => (refreshing = null), 0);
      });
  }
  return refreshing;
}

const retryable = new WeakMap<Request, Request>();

const PASSWORD_CHANGE_PATH = "/changer-mot-de-passe";

/** 403 `password_change_required` : le mot de passe initial doit d'abord être changé. */
async function redirectIfPasswordChangeRequired(response: Response) {
  if (typeof window === "undefined" || window.location.pathname === PASSWORD_CHANGE_PATH) return;
  const err = await toApiError(response);
  if (err.code === "password_change_required") window.location.assign(PASSWORD_CHANGE_PATH);
}

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    retryable.set(request, request.clone());
    if (accessToken) request.headers.set("Authorization", `Bearer ${accessToken}`);
    return request;
  },
  async onResponse({ request, response }) {
    if (response.status === 403) {
      await redirectIfPasswordChangeRequired(response);
      // Restaurant suspendu / fermé pendant la session : le profil est rechargé pour afficher le motif.
      if (ACCESS_BLOCK_CODES.has((await toApiError(response)).code)) onAccessChanged?.();
      return response;
    }
    if (response.status !== 401 || request.url.includes("/api/auth/")) return response;
    const original = retryable.get(request);
    if (!original) return response;
    const token = await refreshOnce();
    if (!token) {
      onSessionLost?.();
      return response;
    }
    const retry = original.clone();
    retry.headers.set("Authorization", `Bearer ${token}`);
    return fetch(retry);
  },
};

export const api = createClient<paths>({ baseUrl: "", credentials: "same-origin" });
api.use(authMiddleware);

/** Déballe une réponse openapi-fetch : retourne `data` ou lève `ApiError`. */
export async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, response } = await p;
  if (!response.ok) throw await toApiError(response);
  return data as T;
}

/** Téléchargement binaire authentifié (QR PNG/SVG/PDF…). */
export async function fetchBlob(url: string): Promise<Blob> {
  const doFetch = (token: string | null) =>
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: "same-origin" });
  let res = await doFetch(accessToken);
  if (res.status === 401) res = await doFetch(await refreshOnce());
  if (!res.ok) throw await toApiError(res);
  return res.blob();
}

/** Upload multipart authentifié. */
export async function uploadFile<T>(url: string, form: FormData): Promise<T> {
  const doFetch = (token: string | null) =>
    fetch(url, {
      method: "POST",
      body: form,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "same-origin",
    });
  let res = await doFetch(accessToken);
  if (res.status === 401) res = await doFetch(await refreshOnce());
  if (!res.ok) throw await toApiError(res);
  return res.json() as Promise<T>;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === "validation_error" && Array.isArray(e.details) && e.details.length) {
      const first = e.details[0] as { field?: string; message?: string };
      return `${e.message} : ${first.field ?? ""} ${first.message ?? ""}`.trim();
    }
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return "Une erreur est survenue";
}

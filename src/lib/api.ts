const BASE = (import.meta.env.VITE_API_URL as string) ?? ''

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Erreur serveur')
  return data.data
}

export const api = {
  get:    <T>(path: string)                  => request<T>(path),
  post:   <T>(path: string, body: unknown)   => request<T>(path, { method: 'POST',   body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown)   => request<T>(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete: <T>(path: string)                  => request<T>(path, { method: 'DELETE' }),
}

export function fmtFCFA(n: number) {
  return new Intl.NumberFormat('fr-SN', { maximumFractionDigits: 0 }).format(Number(n)) + ' F'
}

export function fmtEUR(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(n) / 100)
}

export function fmtDateTime(d: string | Date) {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d))
}

export function cn(...c: (string | undefined | false | null)[]) {
  return c.filter(Boolean).join(' ')
}

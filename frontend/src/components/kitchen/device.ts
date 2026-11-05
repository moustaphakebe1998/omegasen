"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SOUND_KEY = "omegasen.kitchen.sound";

type AudioCtor = typeof AudioContext;

function audioCtor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext ?? null;
}

/**
 * Bips sonores via Web Audio. Les navigateurs bloquent l'audio tant qu'aucun geste
 * utilisateur n'a eu lieu : `enable()` doit être appelé depuis un clic. Le choix est
 * mémorisé ; au rechargement, le premier contact avec l'écran réactive le son.
 */
export function useKitchenSound() {
  const [enabled, setEnabled] = useState(false);
  const [running, setRunning] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const enabledRef = useRef(false);
  enabledRef.current = enabled;

  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(SOUND_KEY) === "1");
    } catch {
      /* stockage indisponible */
    }
  }, []);

  const ensureContext = useCallback(() => {
    if (!ctxRef.current) {
      const Ctor = audioCtor();
      if (!Ctor) return null;
      const ctx = new Ctor();
      ctx.onstatechange = () => setRunning(ctx.state === "running");
      ctxRef.current = ctx;
    }
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") {
      ctx
        .resume()
        .then(() => setRunning(ctx.state === "running"))
        .catch(() => undefined);
    }
    setRunning(ctx.state === "running");
    return ctx;
  }, []);

  // Son mémorisé : on réveille le contexte audio au premier geste.
  useEffect(() => {
    if (!enabled || running) return;
    const onGesture = () => ensureContext();
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, [enabled, running, ensureContext]);

  useEffect(() => () => void ctxRef.current?.close().catch(() => undefined), []);

  /** `count` bips courts (deux tons alternés). */
  const beep = useCallback((count = 2) => {
    const ctx = ctxRef.current;
    if (!enabledRef.current || !ctx || ctx.state !== "running") return;
    const start = ctx.currentTime + 0.02;
    for (let i = 0; i < count; i++) {
      const t = start + i * 0.22;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = i % 2 === 0 ? 880 : 1320;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    }
  }, []);

  const enable = useCallback(() => {
    ensureContext();
    setEnabled(true);
    enabledRef.current = true;
    try {
      localStorage.setItem(SOUND_KEY, "1");
    } catch {
      /* stockage indisponible */
    }
    // Bip de test, une fois le contexte réellement démarré.
    setTimeout(() => beep(2), 150);
  }, [ensureContext, beep]);

  const disable = useCallback(() => {
    setEnabled(false);
    try {
      localStorage.setItem(SOUND_KEY, "0");
    } catch {
      /* stockage indisponible */
    }
  }, []);

  return { enabled, active: enabled && running, enable, disable, beep };
}

/** Empêche la mise en veille de l'écran (réacquis au retour sur l'onglet). */
export function useWakeLock() {
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      if (stopped || document.visibilityState !== "visible" || !("wakeLock" in navigator)) return;
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        /* refusé (batterie faible, onglet masqué…) */
      }
    };
    void acquire();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      sentinel?.release().catch(() => undefined);
    };
  }, []);
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    onChange();
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);
  return { isFullscreen, toggle };
}

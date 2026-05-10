import { useEffect, useRef } from "react";

/** Cierre de sesión automático tras inactividad (entre pestañas del mismo navegador / origen). */
const IDLE_MS = 30 * 60 * 1000;

const STORAGE_KEY = "pilot_last_activity_ts";

/** Evita spam en localStorage; el ref siempre lleva última actividad local. */
const LS_WRITE_GAP_MS = 2000;

/** Eventos muy frecuentes: submuestrear para no saturar listeners. */
const HIGH_FREQ_GAP_MS = 1000;

const HIGH_FREQ_ACTIVITY_EVENTS = ["mousemove", "touchmove", "scroll", "wheel"] as const;

const WINDOW_ACTIVITY_EVENTS = [
  "mousedown",
  "mouseup",
  "pointerdown",
  "keydown",
  "keyup",
  "touchstart",
  "touchend",
  "click",
  "dblclick",
  "auxclick",
] as const;

function throttle(fn: () => void, gapMs: number) {
  let last = 0;
  return () => {
    const now = Date.now();
    if (now - last < gapMs) return;
    last = now;
    fn();
  };
}

function readStoredActivityTs(): number | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Ejecuta `onIdle` si pasan `IDLE_MS` sin actividad (cualquier pestaña del mismo origen).
 * Al volver a la pestaña con `visibilitychange`, comprueba de inmediato.
 */
export function useIdleSessionSignOut(enabled: boolean, onIdle: () => void | Promise<void>) {
  const lastActivityRef = useRef(Date.now());
  const lastLsWriteRef = useRef(0);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const syncFromStored = () => {
      const t = readStoredActivityTs();
      if (t == null) return;
      const age = Date.now() - t;
      if (age >= IDLE_MS) return;
      lastActivityRef.current = Math.max(lastActivityRef.current, t);
    };

    /** Evita valores viejos en localStorage desde hace semanas cerrando sesión al instante. */
    const now = Date.now();
    const stored = readStoredActivityTs();
    lastActivityRef.current =
      stored != null && now - stored < IDLE_MS ? Math.max(stored, now) : now;

    const bump = () => {
      const now = Date.now();
      lastActivityRef.current = Math.max(lastActivityRef.current, now);
      const sinceLs = now - lastLsWriteRef.current;
      if (sinceLs >= LS_WRITE_GAP_MS) {
        lastLsWriteRef.current = now;
        try {
          localStorage.setItem(STORAGE_KEY, String(now));
        } catch {
          /* private mode / bloqueado */
        }
      }
    };

    const check = () => {
      syncFromStored();
      if (Date.now() - lastActivityRef.current >= IDLE_MS) {
        void onIdleRef.current();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };

    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== localStorage || e.key !== STORAGE_KEY || e.newValue == null) return;
      const t = Number(e.newValue);
      if (!Number.isFinite(t)) return;
      lastActivityRef.current = Math.max(lastActivityRef.current, t);
    };

    const onFocusWindow = () => bump();

    for (const ev of WINDOW_ACTIVITY_EVENTS) {
      window.addEventListener(ev, bump, { passive: true });
    }

    /** Enfoques y escritura en controles dentro del árbol. */
    document.addEventListener("focusin", bump, true);
    document.addEventListener("input", bump, true);

    const throttledBump = throttle(bump, HIGH_FREQ_GAP_MS);
    for (const ev of HIGH_FREQ_ACTIVITY_EVENTS) {
      window.addEventListener(ev, throttledBump, { passive: true, capture: true });
    }

    window.addEventListener("focus", onFocusWindow);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    const intervalId = window.setInterval(check, 60_000);

    bump();

    return () => {
      for (const ev of WINDOW_ACTIVITY_EVENTS) {
        window.removeEventListener(ev, bump);
      }
      document.removeEventListener("focusin", bump, true);
      document.removeEventListener("input", bump, true);
      for (const ev of HIGH_FREQ_ACTIVITY_EVENTS) {
        window.removeEventListener(ev, throttledBump, { capture: true });
      }
      window.removeEventListener("focus", onFocusWindow);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(intervalId);
    };
  }, [enabled]);
}

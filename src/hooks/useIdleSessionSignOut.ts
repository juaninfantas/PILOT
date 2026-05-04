import { useEffect, useRef } from "react";

/** Cierre de sesión automático por inactividad (solo pestaña actual). */
const IDLE_MS = 30 * 60 * 1000;

const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "wheel", "scroll"] as const;

/**
 * Llama `onIdle` si pasan `IDLE_MS` sin eventos de usuario en esta pestaña.
 * Al volver a la pestaña con `visibilitychange`, comprueba de inmediato.
 */
export function useIdleSessionSignOut(enabled: boolean, onIdle: () => void | Promise<void>) {
  const lastActivityRef = useRef(Date.now());
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const bump = () => {
      lastActivityRef.current = Date.now();
    };

    const check = () => {
      if (Date.now() - lastActivityRef.current >= IDLE_MS) {
        void onIdleRef.current();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, bump, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);
    const intervalId = window.setInterval(check, 60_000);
    bump();

    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, bump);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(intervalId);
    };
  }, [enabled]);
}

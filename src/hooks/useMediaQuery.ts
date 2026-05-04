import { useEffect, useState } from "react";

/** Coincide con breakpoint `md` de Tailwind (768px). */
export function useMdUp(): boolean {
  const [mdUp, setMdUp] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : true,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const fn = () => setMdUp(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  return mdUp;
}

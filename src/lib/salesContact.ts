/** Botón Contratar (Pro): URL completa o `mailto:` — `.env`: VITE_SALES_CONTACT_URL */
export function getSalesContactHref(): string {
  const v = import.meta.env.VITE_SALES_CONTACT_URL as string | undefined;
  if (v && v.trim()) return v.trim();
  return "mailto:ventas@pilot.app?subject=Contratación%20Pilot%20Pro";
}

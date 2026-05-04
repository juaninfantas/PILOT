export function LandingReportesControlPage() {
  return (
    <main className="border-t border-[var(--jif-line)] bg-[var(--background)] py-12 md:py-16">
      <div className="mx-auto max-w-5xl px-4 md:px-8">
        <div className="border-l border-[var(--jif-gold)] pl-4">
          <p className="jif-caps jif-dim text-[0.65rem]">Funcionalidades</p>
          <h1 className="jif-hero mt-2 text-lg md:text-2xl">Reportes y control</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
            <strong className="text-[var(--foreground)]">Control Tower</strong> concentra en un solo lienzo cómo están las oportunidades,
            el stock y la tasa de cierre sin saltar entre hojas. Desde ahí llegás rápido a overview, pipeline, funnels por etapa,
            estados finales y calendario con actividades.
          </p>
          <ul className="mt-4 list-inside list-disc space-y-1 text-sm text-[var(--muted)] marker:text-[var(--jif-gold)]">
            <li>Oportunidades por estado con lectura ejecutiva instantánea</li>
            <li>Barras y totales Won / Open y seguimiento de stock</li>
            <li>Propiedades por zona y línea de precio público promedio</li>
          </ul>
        </div>
        <figure className="mt-10 overflow-hidden rounded-xl border border-[var(--jif-line)] bg-[var(--card)] shadow-[var(--neo-shadow-sm)]">
          <img
            src="/marketing/control-tower.png"
            alt="Panel Control Tower de Pilot con KPIs y gráficos"
            className="h-auto max-h-[min(52vh,480px)] w-full object-cover object-[center_top]"
          />
        </figure>
      </div>
    </main>
  );
}

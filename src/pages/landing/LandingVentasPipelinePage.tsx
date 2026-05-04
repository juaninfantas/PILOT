export function LandingVentasPipelinePage() {
  return (
    <main className="border-t border-[var(--jif-line)] bg-[var(--card)] py-12 md:py-16">
      <div className="mx-auto max-w-4xl px-4 md:px-8">
        <div className="border-l border-[var(--jif-gold)] pl-4">
          <p className="jif-caps jif-dim text-[0.65rem]">Funcionalidades</p>
          <h1 className="jif-hero mt-2 text-lg md:text-2xl">Ventas y pipeline</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
            Embudo configurable por tu inmobiliaria: etapas claras desde el primer contacto hasta el cierre, con vista de cargas por
            etapa y métricas de participación dentro del funnel.
          </p>
        </div>
        <figure className="mt-10 overflow-hidden rounded-xl border border-[var(--jif-line)] bg-[var(--background)] shadow-[var(--neo-shadow-sm)]">
          <img
            src="/marketing/ventas-pipeline.png"
            alt="Vista de embudo de ventas con etapas Nuevo, Contacto, Visita, Negociación y Cerrado"
            className="h-auto max-h-[min(78vh,640px)] w-full object-cover object-top"
          />
        </figure>
      </div>
    </main>
  );
}

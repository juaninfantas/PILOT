import { Link } from "react-router-dom";

export function LandingFeaturesPage() {
  return (
    <main className="border-t border-[var(--jif-line)] bg-[var(--card)] py-16">
      <div className="mx-auto max-w-5xl px-4 md:px-8">
        <div className="border-l border-[var(--jif-gold)] pl-4">
          <h1 className="jif-hero text-lg md:text-xl">Funcionalidades</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
            Inventario visible, agendas de venta reunidas y métricas accionables, sin dispersar información entre hojas y mensajes
            sueltos.
          </p>
        </div>
        <ul className="mt-10 grid gap-3 sm:grid-cols-2">
          {[
            {
              text: "Un solo lienzo para el stock visible en mapa y ficha detallada",
              href: "/login",
              link: "Acceder al panel →",
            },
            {
              text: "Trayectorias de venta por funnel con etapas claras",
              href: "/funcionalidades/ventas-pipeline",
              link: "Ver embudo →",
            },
            {
              text: "Reportes ejecutivos y Control Tower centralizado",
              href: "/funcionalidades/reportes-y-control",
              link: "Ver paneles →",
            },
          ].map(({ text, href, link }) => (
            <li key={text} className="jif-card flex flex-col border-[var(--jif-line)] p-4 text-sm leading-snug text-[var(--foreground)]">
              <span>{text}</span>
              <Link to={href} className="mt-3 inline-flex text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline">
                {link}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

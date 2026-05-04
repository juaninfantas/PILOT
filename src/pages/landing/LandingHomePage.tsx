import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";

export function LandingHomePage() {
  return (
    <main>
      <section className="mx-auto max-w-5xl px-4 pb-20 pt-10 md:px-8 md:pt-12">
        <div className="jif-panel border border-[var(--jif-line)] bg-[var(--card)] px-8 py-12 shadow-[var(--neo-shadow-sm)] md:px-14 md:py-16">
          <p className="jif-caps jif-dim text-center text-[0.65rem] tracking-[0.28em]">Operación comercial inmobiliaria</p>
          <h1 className="font-pilot-logo mt-5 text-center text-[clamp(3.25rem,14vw,7.5rem)] leading-[0.95] text-[var(--foreground)]">
            Pilot.
          </h1>
          <p className="mx-auto mt-8 max-w-xl text-center text-base leading-relaxed text-[var(--foreground)] md:text-lg">
            Un entorno claro para que tu equipo gestione stock, clientes y oportunidades sin perder el hilo operativo.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link to="/login">
              <Button type="button" variant="primary" size="lg" className="px-8">
                Entrar al panel
              </Button>
            </Link>
            <Link to="/contacto">
              <Button type="button" variant="ghost" size="lg" className="jif-panel border-[var(--jif-line)] hover:bg-[#f0e9dd]">
                Solicitud comercial
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

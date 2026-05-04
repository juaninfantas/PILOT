import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { getSalesContactHref } from "../../lib/salesContact";

export function LandingContactoPage() {
  return (
    <main className="border-t border-[var(--jif-line)] bg-[var(--background)] py-16">
      <div className="mx-auto max-w-lg px-4 text-center md:px-8">
        <h1 className="font-neo text-lg font-semibold uppercase tracking-wide text-[var(--foreground)] md:text-xl">
          Conversemos tu implementación
        </h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Plazos, tamaño del equipo y eventuales datos a migrar: coordinamos los siguientes pasos.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a href={getSalesContactHref()} rel="noopener noreferrer" className="inline-flex sm:flex-initial">
            <Button type="button" variant="primary" size="lg" className="w-full sm:w-auto">
              Escribinos
            </Button>
          </a>
          <Link to="/sign-up">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="w-full border border-[var(--jif-line)] bg-[var(--card)] hover:bg-[#f0e9dd] sm:w-auto"
            >
              Acceso por invitación
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Building2, Headphones } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useOrganization } from "../../contexts/OrganizationContext";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Modal } from "../ui/modal";
import { cn } from "../../lib/utils";

type OrgHit = { id: string; slug: string; display_name: string };

type StaffTenantSwitcherProps = {
  /** En barra móvil: solo icono compacto. */
  compact?: boolean;
};

export function StaffTenantSwitcher({ compact }: StaffTenantSwitcherProps) {
  const { pilotStaff, organization, refresh } = useOrganization();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<OrgHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const runSearch = useCallback(async (q: string) => {
    setSearching(true);
    setErr(null);
    const { data, error } = await supabase.rpc("staff_search_organizations", {
      p_query: q.trim(),
      p_limit: 50,
    });
    setSearching(false);
    if (error) {
      console.error(error);
      setErr(error.message);
      setHits([]);
      return;
    }
    setHits((data as OrgHit[]) ?? []);
  }, []);

  useEffect(() => {
    if (!open || !pilotStaff.platformStaff) return;
    const t = window.setTimeout(() => void runSearch(query), 280);
    return () => window.clearTimeout(t);
  }, [open, query, pilotStaff.platformStaff, runSearch]);

  async function pickOrg(id: string) {
    setWorking(true);
    setErr(null);
    const { error } = await supabase.rpc("staff_set_impersonation", { p_organization_id: id });
    setWorking(false);
    if (error) {
      console.error(error);
      setErr(error.message);
      return;
    }
    await refresh();
    setOpen(false);
    setQuery("");
  }

  async function clearImpersonation() {
    setWorking(true);
    setErr(null);
    const { error } = await supabase.rpc("staff_clear_impersonation");
    setWorking(false);
    if (error) {
      console.error(error);
      setErr(error.message);
      return;
    }
    await refresh();
    setOpen(false);
  }

  if (!pilotStaff.platformStaff) return null;

  const expiresLabel =
    pilotStaff.impersonating && pilotStaff.impersonationExpiresAt
      ? new Date(pilotStaff.impersonationExpiresAt).toLocaleString(undefined, {
          dateStyle: "short",
          timeStyle: "short",
        })
      : null;

  return (
    <>
      <div className={cn("flex items-center gap-2", compact && "flex-shrink-0")}>
        {pilotStaff.impersonating ? (
          <span
            className="hidden max-w-[10rem] truncate rounded-md border border-amber-700/35 bg-amber-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-950 sm:inline sm:max-w-[14rem]"
            title={expiresLabel ?? "Modo soporte"}
          >
            Soporte · {organization?.display_name ?? "…"}
          </span>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={cn(compact && "h-9 min-w-9 px-2")}
          aria-label="Cambiar inmobiliaria (soporte Pilot)"
          disabled={working}
          onClick={() => {
            setErr(null);
            setOpen(true);
            void runSearch("");
          }}
        >
          {compact ? <Headphones className="size-4" /> : (
            <>
              <Building2 className="size-4" />
              Inmobiliaria
            </>
          )}
        </Button>
      </div>

      <Modal
        open={open}
        title="Inmobiliaria (soporte Pilot)"
        onClose={() => {
          setOpen(false);
          setErr(null);
        }}
        panelClassName="max-w-md"
      >
        <p className="text-sm text-[var(--muted)]">
          Buscá por nombre o slug. El acceso efectivo cambia durante unas horas; podés volver a tu cuenta en cualquier
          momento.
        </p>
        {expiresLabel ? (
          <p className="text-xs text-[var(--muted)]">Sesión soporte hasta: {expiresLabel}</p>
        ) : null}

        <div className="space-y-2">
          <label className="text-xs font-medium text-[var(--muted)]">Buscar</label>
          <Input
            value={query}
            placeholder="Ej. plaza, demo…"
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        {err ? <p className="text-sm text-red-700">{err}</p> : null}

        <div className="max-h-56 overflow-y-auto rounded-lg border border-[var(--border)] bg-[#fffcf7]">
          {searching ? (
            <p className="p-3 text-sm text-[var(--muted)]">Buscando…</p>
          ) : hits.length === 0 ? (
            <p className="p-3 text-sm text-[var(--muted)]">Sin resultados.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm hover:bg-stone-900/5"
                    disabled={working}
                    onClick={() => void pickOrg(h.id)}
                  >
                    <span className="font-medium">{h.display_name}</span>
                    <span className="text-xs text-[var(--muted)]">{h.slug}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {pilotStaff.impersonating ? (
          <Button type="button" variant="danger" size="sm" className="w-full" disabled={working} onClick={() => void clearImpersonation()}>
            Salir del modo soporte (volver a mi inmobiliaria)
          </Button>
        ) : null}
      </Modal>
    </>
  );
}

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useActiveOrganization } from "../../contexts/OrganizationContext";
import { Button } from "../../components/ui/button";
import type { Database } from "../../types/database";

type InviteRow = Database["public"]["Tables"]["OrganizationInvite"]["Row"];

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function shortId(id: string | null) {
  if (!id) return "—";
  return `${id.slice(0, 8)}…`;
}

export function InviteSettingsSection() {
  const org = useActiveOrganization();
  const [rows, setRows] = useState<InviteRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [pendingGen, setPendingGen] = useState(false);

  const load = useCallback(async () => {
    setMsg(null);
    const { data, error } = await supabase
      .from("OrganizationInvite")
      .select("*")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false });
    if (error) {
      setMsg(error.message);
      return;
    }
    setRows((data as InviteRow[]) ?? []);
  }, [org.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = rows.filter((r) => r.used_at == null && r.revoked_at == null);
  const primary = active[0];

  async function onGenerate() {
    setMsg(null);
    setPendingGen(true);
    const { data, error } = await supabase.rpc("generate_organization_invite");
    setPendingGen(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    const row = Array.isArray(data) && data[0] ? data[0] : null;
    if (!row) {
      setMsg("No se pudo obtener el código nuevo.");
      return;
    }
    setMsg(`Listo. Nuevo código activo hasta ${fmt(row.expires_at)}.`);
    void load();
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setMsg("Código copiado al portapapeles.");
    } catch {
      setMsg("Copiá manualmente el código mostrado.");
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Invitaciones al equipo</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Un código vigente por vez. Cada código es de <strong>un solo uso</strong> y caduca a los 5 días. Historial y consumo
          quedan registrados.
        </p>
      </div>

      {msg ? <p className="text-sm text-[var(--accent)]">{msg}</p> : null}

      {primary ? (
        <div className="jif-panel border border-[var(--jif-line)] bg-[var(--background)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Código visible (único uso)</p>
          <p className="mt-2 font-mono text-lg font-semibold tracking-wide text-[var(--foreground)]">{primary.code}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Vence: {fmt(primary.expires_at)} · Creado por usuario {shortId(primary.created_by_user_id)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="ghost" size="sm" className="border border-[var(--jif-line)]" onClick={() => void copyCode(primary.code)}>
              Copiar
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          Todavía no hay un código activo. Si migraste desde datos antiguos, puede existir uno en tabla con larga vigencia; si no aparece,
          generá uno nuevo.
        </p>
      )}

      <div>
        <Button type="button" variant="neo" disabled={pendingGen} onClick={() => void onGenerate()}>
          {pendingGen ? "Generando…" : primary ? "Regenerar código" : "Generar invitación"}
        </Button>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Al regenerar, los códigos activos pendientes previos pasan a inválidos y el nuevo queda como único visible.
        </p>
      </div>

      <div className="overflow-x-auto pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Historial</p>
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--jif-line)] text-[var(--muted)]">
              <th className="py-2 pr-2 font-medium">Código</th>
              <th className="py-2 pr-2 font-medium">Creado</th>
              <th className="py-2 pr-2 font-medium">Vence</th>
              <th className="py-2 pr-2 font-medium">Por</th>
              <th className="py-2 pr-2 font-medium">Estado</th>
              <th className="py-2 font-medium">Usado por</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const state =
                r.used_at != null
                  ? "Consumido"
                  : r.revoked_at != null
                    ? "Reemplazado"
                    : new Date(r.expires_at).getTime() < Date.now()
                      ? "Vencido"
                      : "Activo";
              return (
                <tr key={r.id} className="border-b border-[var(--jif-line)]/70">
                  <td className="py-2 pr-2 font-mono">{r.code}</td>
                  <td className="py-2 pr-2">{fmt(r.created_at)}</td>
                  <td className="py-2 pr-2">{fmt(r.expires_at)}</td>
                  <td className="py-2 pr-2">{shortId(r.created_by_user_id)}</td>
                  <td className="py-2 pr-2">{state}</td>
                  <td className="py-2 font-mono text-[var(--muted)]">{r.used_at ? shortId(r.used_by_user_id) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { useOrganization } from "../../contexts/OrganizationContext";
import type { Database } from "../../types/database";

type InviteRow = Database["public"]["Tables"]["OrganizationInvite"]["Row"] & {
  target_person_name: string | null;
};

type AgentPersonOption = { id: string; name: string; email: string | null };

type OrgMemberOption = { user_id: string; email: string | null; name: string | null };

type GenerateInviteRow = {
  invite_id: string;
  code: string;
  expires_at: string;
  target_access: string;
  target_person_id: string | null;
};

const ACCESS_OPTIONS = [
  { value: "agente", label: "Agente (solo sus cargas)" },
  { value: "admin", label: "Administrador (ve todo)" },
  { value: "consulta", label: "Consulta (solo lectura)" },
] as const;

const ACCESS_LABEL: Record<string, string> = {
  agente: "Agente",
  admin: "Admin",
  consulta: "Consulta",
};

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function shortId(id: string | null) {
  if (!id) return "—";
  return `${id.slice(0, 8)}…`;
}

const BASE_URL = "https://pilot.jinfantas.com";

export function InviteSettingsSection() {
  const { organization } = useOrganization();
  const [rows, setRows] = useState<InviteRow[]>([]);
  const [members, setMembers] = useState<OrgMemberOption[]>([]);
  const [agentPersons, setAgentPersons] = useState<AgentPersonOption[]>([]);
  const [targetAccess, setTargetAccess] = useState<(typeof ACCESS_OPTIONS)[number]["value"]>("agente");
  const [targetPersonId, setTargetPersonId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [msgIsError, setMsgIsError] = useState(false);
  const [pendingGen, setPendingGen] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadInvites = useCallback(async (): Promise<InviteRow[]> => {
    const { data, error } = await supabase.rpc("list_organization_invites");
    if (error) {
      const fallback = await supabase
        .from("OrganizationInvite")
        .select("*")
        .order("created_at", { ascending: false });
      if (fallback.error) return [];
      return ((fallback.data ?? []) as InviteRow[]).map((r) => ({
        ...r,
        target_person_name: null,
      }));
    }
    return (data as InviteRow[]) ?? [];
  }, []);

  const load = useCallback(
    async (opts?: { preserveMsg?: boolean }) => {
      if (!opts?.preserveMsg) {
        setMsg(null);
        setMsgIsError(false);
      }
      const [{ data: agents, error: aErr }, { data: memberRows, error: mErr }, inviteRows] = await Promise.all([
        supabase.rpc("list_org_agent_persons_unlinked"),
        supabase.rpc("list_org_members"),
        loadInvites(),
      ]);
      if (aErr) {
        setMsg(aErr.message);
        setMsgIsError(true);
      }
      if (mErr) console.warn("list_org_members", mErr);
      setRows(inviteRows);
      setMembers((memberRows as OrgMemberOption[]) ?? []);
      setAgentPersons((agents as AgentPersonOption[]) ?? []);
    },
    [loadInvites],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (targetAccess !== "agente") setTargetPersonId("");
  }, [targetAccess]);

  const active = rows.filter(
    (r) =>
      r.used_at == null &&
      r.revoked_at == null &&
      new Date(r.expires_at).getTime() > Date.now(),
  );
  const historyRows = rows
    .filter((r) => r.used_at != null)
    .sort((a, b) => new Date(b.used_at!).getTime() - new Date(a.used_at!).getTime());

  function usedByLabel(userId: string | null) {
    if (!userId) return "—";
    const member = members.find((m) => m.user_id === userId);
    if (member?.name?.trim()) return `${member.name.trim()} (${member.email})`;
    if (member?.email) return member.email;
    return shortId(userId);
  }

  function personLabel(invite: InviteRow): string {
    if (invite.target_person_name) return invite.target_person_name;
    if (!invite.target_person_id) return "";
    const found = agentPersons.find((p) => p.id === invite.target_person_id);
    return found ? found.name : shortId(invite.target_person_id);
  }

  function buildShareText(invite: InviteRow): string {
    const slug = organization?.slug ?? "";
    const orgName = organization?.display_name ?? "la inmobiliaria";
    const person = personLabel(invite);
    const url = `${BASE_URL}/sign-up?org=${slug}&invite=${invite.code}`;

    const greeting = person ? `¡Hola ${person}! ` : "";
    return [
      `${greeting}Te invitamos a sumarte al equipo de *${orgName}* en Pilot.`,
      "",
      `Registrate en: ${url}`,
      "",
      `• Inmobiliaria: *${slug}*`,
      `• Código: *${invite.code}*`,
      `• Tu rol: ${ACCESS_LABEL[invite.target_access] ?? invite.target_access}`,
      `• Código válido hasta: ${fmtDate(invite.expires_at)}`,
    ].join("\n");
  }

  async function copyShareText(invite: InviteRow) {
    try {
      await navigator.clipboard.writeText(buildShareText(invite));
      setCopiedId(invite.id);
      setTimeout(() => setCopiedId((prev) => (prev === invite.id ? null : prev)), 2500);
    } catch {
      setMsg("No se pudo copiar automáticamente. Copiá el texto manualmente.");
      setMsgIsError(true);
    }
  }

  async function onGenerate() {
    setMsg(null);
    setMsgIsError(false);
    setPendingGen(true);
    try {
      const personArg = targetAccess === "agente" && targetPersonId ? targetPersonId : null;
      if (personArg) {
        const { data: agents, error: aErr } = await supabase.rpc("list_org_agent_persons_unlinked");
        if (aErr) throw aErr;
        const stillValid = ((agents as AgentPersonOption[]) ?? []).some((p) => p.id === personArg);
        if (!stillValid) {
          setMsg("La persona seleccionada ya no está disponible. Elegí otra o dejá el campo vacío.");
          setMsgIsError(true);
          void load({ preserveMsg: true });
          return;
        }
      }

      const { data, error } = await supabase.rpc("generate_organization_invite", {
        p_target_access: targetAccess,
        p_target_person_id: personArg,
      });
      if (error) throw error;

      const row = (Array.isArray(data) ? data[0] : data) as GenerateInviteRow | null;
      if (!row?.code) {
        setMsg("No se pudo obtener el código nuevo.");
        setMsgIsError(true);
        return;
      }

      const label = personArg
        ? `para ${agentPersons.find((p) => p.id === personArg)?.name ?? "la persona seleccionada"}`
        : "genérico";
      setMsg(`Código ${label} generado. Rol: ${ACCESS_LABEL[String(row.target_access)] ?? "agente"} · Vence: ${fmt(row.expires_at)}.`);
      setMsgIsError(false);

      setTargetPersonId("");
      const inviteRows = await loadInvites();
      setRows(inviteRows);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Error al generar la invitación.";
      setMsg(text);
      setMsgIsError(true);
    } finally {
      setPendingGen(false);
    }
  }

  async function onRevoke(invite: InviteRow) {
    setRevokingId(invite.id);
    try {
      const { error } = await supabase.rpc("revoke_organization_invite", {
        p_invite_id: invite.id,
      });
      if (error) throw error;
      setMsg("Código revocado.");
      setMsgIsError(false);
      const inviteRows = await loadInvites();
      setRows(inviteRows);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Error al revocar.";
      setMsg(text);
      setMsgIsError(true);
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Invitaciones al equipo</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Cada código es de <strong>un solo uso</strong> y caduca a los 5 días. Podés tener un código genérico y uno por
          persona simultáneamente. Definí el rol y, opcionalmente, la ficha agente vinculada.
        </p>
      </div>

      {msg ? (
        <p
          className={`text-sm ${msgIsError ? "rounded-lg border border-red-300/60 bg-red-50 px-3 py-2 text-red-800" : "text-[var(--accent)]"}`}
          role={msgIsError ? "alert" : "status"}
        >
          {msg}
        </p>
      ) : null}

      {/* ─── Formulario de generación ─── */}
      <div className="grid gap-4 rounded-lg border border-[var(--jif-line)] bg-[var(--background)] p-4 md:grid-cols-2">
        <div>
          <Label htmlFor="invite-access">Rol al registrarse</Label>
          <select
            id="invite-access"
            value={targetAccess}
            onChange={(e) => setTargetAccess(e.target.value as (typeof ACCESS_OPTIONS)[number]["value"])}
            className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
          >
            {ACCESS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {targetAccess === "agente" ? (
          <div>
            <Label htmlFor="invite-person">Persona agente (opcional)</Label>
            <select
              id="invite-person"
              value={targetPersonId}
              onChange={(e) => setTargetPersonId(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
            >
              <option value="">Sin vincular — código genérico</option>
              {agentPersons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.email ? ` (${p.email})` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Creá primero la persona con perfil Agente en Personas si querés vincularla al alta.
            </p>
          </div>
        ) : null}
      </div>

      <div>
        <Button type="button" variant="neo" disabled={pendingGen} onClick={() => void onGenerate()}>
          {pendingGen ? "Generando…" : "Generar invitación"}
        </Button>
      </div>

      {/* ─── Códigos activos ─── */}
      {active.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No hay códigos activos en este momento.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Códigos activos ({active.length})
          </p>
          {active.map((inv) => {
            const person = personLabel(inv);
            const isCopied = copiedId === inv.id;
            const shareText = buildShareText(inv);
            return (
              <div
                key={inv.id}
                className="jif-panel rounded-lg border border-[var(--jif-line)] bg-[var(--background)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-base font-semibold tracking-wide text-[var(--foreground)]">
                      {inv.code}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Rol: <strong>{ACCESS_LABEL[inv.target_access] ?? inv.target_access}</strong>
                      {person ? (
                        <>
                          {" · "}Para: <strong>{person}</strong>
                        </>
                      ) : (
                        " · Código genérico"
                      )}
                      {" · "}Vence: {fmt(inv.expires_at)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 border border-red-300/60 text-red-700 hover:bg-red-50"
                    disabled={revokingId === inv.id}
                    onClick={() => void onRevoke(inv)}
                  >
                    {revokingId === inv.id ? "Revocando…" : "Revocar"}
                  </Button>
                </div>

                {/* Texto compartible WhatsApp */}
                <div className="mt-3 rounded-md border border-[var(--jif-line)] bg-[var(--card)] px-3 py-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                    Texto para compartir por WhatsApp
                  </p>
                  <pre className="whitespace-pre-wrap break-all font-sans text-xs text-[var(--foreground)]">
                    {shareText}
                  </pre>
                  <div className="mt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="border border-[var(--jif-line)]"
                      onClick={() => void copyShareText(inv)}
                    >
                      {isCopied ? "¡Copiado!" : "Copiar texto"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Historial ─── */}
      <div className="overflow-x-auto pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Historial</p>
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--jif-line)] text-[var(--muted)]">
              <th className="py-2 pr-2 font-medium">Código</th>
              <th className="py-2 pr-2 font-medium">Rol</th>
              <th className="py-2 pr-2 font-medium">Para</th>
              <th className="py-2 pr-2 font-medium">Creado</th>
              <th className="py-2 pr-2 font-medium">Vence</th>
              <th className="py-2 pr-2 font-medium">Estado</th>
              <th className="py-2 font-medium">Usado por</th>
            </tr>
          </thead>
          <tbody>
            {historyRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-4 text-[var(--muted)]">
                  Todavía no hay invitaciones consumidas.
                </td>
              </tr>
            ) : (
              historyRows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--jif-line)]/70">
                  <td className="py-2 pr-2 font-mono">{r.code}</td>
                  <td className="py-2 pr-2">{ACCESS_LABEL[r.target_access] ?? r.target_access}</td>
                  <td className="py-2 pr-2">{r.target_person_name ?? (r.target_person_id ? shortId(r.target_person_id) : "—")}</td>
                  <td className="py-2 pr-2">{fmt(r.created_at)}</td>
                  <td className="py-2 pr-2">{fmt(r.expires_at)}</td>
                  <td className="py-2 pr-2">Consumido</td>
                  <td className="py-2 text-[var(--foreground)]">{usedByLabel(r.used_by_user_id)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

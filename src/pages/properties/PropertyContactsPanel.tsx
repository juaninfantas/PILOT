import { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { hasPermission } from "../../lib/permissions";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Modal } from "../../components/ui/modal";
import type { Database } from "../../types/database";

type ContactRow = Database["public"]["Tables"]["PropertyPersonContact"]["Row"];
type PersonRow = Database["public"]["Tables"]["Person"]["Row"];

type LoadedRow = ContactRow & Pick<PersonRow, "name" | "email" | "phone">;

/** Un solo perfil por contacto en alta/edición en propiedad (excluyente). */
type PropertyContactModalRole = "owner" | "family" | "guardian" | "broker";

function contactRoleFromRow(
  row: Pick<ContactRow, "is_owner" | "is_family" | "is_guardian" | "is_broker">,
): PropertyContactModalRole | null {
  if (row.is_broker) return "broker";
  if (row.is_owner && !row.is_family && !row.is_guardian) return "owner";
  if (!row.is_owner && row.is_family && !row.is_guardian) return "family";
  if (!row.is_owner && !row.is_family && row.is_guardian) return "guardian";
  if (row.is_owner) return "owner";
  if (row.is_family) return "family";
  if (row.is_guardian) return "guardian";
  return null;
}

export function PropertyContactsPanel({ propertyId }: { propertyId: string }) {
  const { permissions } = useAuth();
  const canManage = hasPermission(permissions, "manage_properties");
  const [rows, setRows] = useState<LoadedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"new" | "edit">("new");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [contactRole, setContactRole] = useState<PropertyContactModalRole | null>(null);
  const [rel, setRel] = useState("");
  const [company, setCompany] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const { data: pcs, error: e1 } = await supabase
      .from("PropertyPersonContact")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: true });
    if (e1) {
      setErr(e1.message);
      setRows([]);
      setLoading(false);
      return;
    }
    if (!pcs?.length) {
      setRows([]);
      setLoading(false);
      return;
    }
    const personIds = [...new Set((pcs as ContactRow[]).map((c) => c.person_id))];
    const { data: people, error: e2 } = await supabase
      .from("Person")
      .select("id,name,email,phone")
      .in("id", personIds);
    if (e2) {
      setErr(e2.message);
      setRows([]);
      setLoading(false);
      return;
    }
    const byId = Object.fromEntries(
      ((people as Pick<PersonRow, "id" | "name" | "email" | "phone">[]) ?? []).map((p) => [
        p.id,
        { name: p.name, email: p.email, phone: p.phone },
      ]),
    );
    setRows(
      (pcs as ContactRow[]).map((c) => ({
        ...c,
        ...(byId[c.person_id] ?? { name: "—", email: null, phone: null }),
      })),
    );
    setLoading(false);
  }, [propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  function openNew() {
    setModalMode("new");
    setEditingId(null);
    setName("");
    setEmail("");
    setPhone("");
    setNotes("");
    setContactRole(null);
    setRel("");
    setCompany("");
    setErr(null);
    setModalOpen(true);
  }

  function openEdit(row: LoadedRow) {
    setModalMode("edit");
    setEditingId(row.id);
    setName(row.name);
    setEmail(row.email ?? "");
    setPhone(row.phone ?? "");
    setNotes("");
    setContactRole(contactRoleFromRow(row));
    setRel(row.family_relation ?? "");
    setErr(null);
    void (async () => {
      const { data: pn } = await supabase
        .from("Person")
        .select("notes, company")
        .eq("id", row.person_id)
        .maybeSingle();
      setNotes((pn as { notes: string | null } | null)?.notes ?? "");
      setCompany((pn as { company: string | null } | null)?.company ?? "");
    })();
    setModalOpen(true);
  }

  async function submitModal() {
    if (busy || !propertyId) return;
    const n = name.trim();
    if (!n) {
      setErr("Nombre obligatorio.");
      return;
    }
    if (!contactRole) {
      setErr("Elegí un perfil de contacto.");
      return;
    }
    if (contactRole === "family" && !rel.trim()) {
      setErr("Indicá la relación cuando la persona es familiar.");
      return;
    }

    const own = contactRole === "owner";
    const fam = contactRole === "family";
    const tutor = contactRole === "guardian";
    const broker = contactRole === "broker";

    setBusy(true);
    setErr(null);

    if (modalMode === "new") {
      const { error } = await supabase.rpc("create_property_person_contact", {
        p_property_id: propertyId,
        p_name: n,
        p_email: email.trim() || null,
        p_phone: phone.trim() || null,
        p_notes: notes.trim() || null,
        p_is_owner: own,
        p_is_family: fam,
        p_family_relation: fam ? rel.trim() : null,
        p_is_guardian: tutor,
        p_is_broker: broker,
        p_company: broker ? company.trim() || null : null,
      });
      if (error) setErr(error.message);
      else {
        setModalOpen(false);
        void load();
      }
    } else if (modalMode === "edit" && editingId) {
      const { error } = await supabase.rpc("update_property_person_contact", {
        p_contact_id: editingId,
        p_name: n,
        p_email: email.trim() || null,
        p_phone: phone.trim() || null,
        p_notes: notes.trim() || null,
        p_is_owner: own,
        p_is_family: fam,
        p_family_relation: fam ? rel.trim() : null,
        p_is_guardian: tutor,
        p_is_broker: broker,
        p_company: broker ? company.trim() || null : null,
      });
      if (error) setErr(error.message);
      else {
        setModalOpen(false);
        void load();
      }
    }

    setBusy(false);
  }

  async function removeLink(contactId: string) {
    if (!canManage || busy) return;
    if (!window.confirm("¿Quitar esta persona del contacto de la propiedad? La persona sigue en el maestro.")) return;
    setBusy(true);
    const { error } = await supabase.rpc("delete_property_person_contact", {
      p_contact_id: contactId,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else void load();
  }

  function roleSummary(r: LoadedRow) {
    const parts: string[] = [];
    if (r.is_owner) parts.push("Dueño/a");
    if (r.is_family)
      parts.push(r.family_relation ? `Familiar (${r.family_relation})` : "Familiar");
    if (r.is_guardian) parts.push("Tutor/responsable");
    if (r.is_broker) parts.push("Inmobiliaria / martillero");
    return parts.join(" · ") || "—";
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--muted)]">
          Contactos cargados sólo desde esta pestaña aparecen aquí como roles de propiedad. En Personas pueden verse esos perfiles pero no modificarse desde allí.
        </p>
        {canManage ? (
          <Button type="button" className="jif-btn-primary" onClick={() => openNew()}>
            Nueva persona
          </Button>
        ) : null}
      </div>
      {err ? <p className="text-sm text-red-400">{err}</p> : null}

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Sin contactos. Agregá una persona con Nueva persona.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[#fffcf7]/70 text-left text-xs uppercase text-[var(--muted)]">
                <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Nombre</th>
                <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Email</th>
                <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Teléfono</th>
                <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Roles / relación</th>
                <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="border-b border-[var(--border)] px-3 py-2 font-medium">{r.name}</td>
                  <td className="border-b border-[var(--border)] px-3 py-2 text-[var(--muted)]">{r.email ?? "—"}</td>
                  <td className="border-b border-[var(--border)] px-3 py-2 text-[var(--muted)]">{r.phone ?? "—"}</td>
                  <td className="border-b border-[var(--border)] px-3 py-2 text-[var(--muted)]">{roleSummary(r)}</td>
                  <td className="border-b border-[var(--border)] px-3 py-2 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Link
                        to={`/dashboard/people/${r.person_id}`}
                        className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                      >
                        Ficha <ExternalLink className="size-3.5" strokeWidth={1.75} />
                      </Link>
                      {canManage ? (
                        <>
                          <button
                            type="button"
                            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] hover:underline"
                            onClick={() => openEdit(r)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="text-xs text-red-400 hover:underline"
                            onClick={() => void removeLink(r.id)}
                          >
                            Quitar
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setErr(null);
        }}
        title={modalMode === "new" ? "Nueva persona" : "Editar contacto"}
        panelClassName="max-w-xl"
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label htmlFor="ppc-name">Nombre *</Label>
              <Input
                id="ppc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="ppc-email">Email</Label>
              <Input
                id="ppc-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="ppc-phone">Teléfono</Label>
              <Input id="ppc-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
            </div>
            <div className="md:col-span-2">
              <Label>Perfil de contacto</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setContactRole("owner")}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    contactRole === "owner"
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--foreground)]"
                      : "border-[var(--border)] bg-[#fffcf7] text-[var(--muted)] hover:border-[var(--accent)]/40"
                  }`}
                >
                  Dueño/a
                </button>
                <button
                  type="button"
                  onClick={() => setContactRole("family")}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    contactRole === "family"
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--foreground)]"
                      : "border-[var(--border)] bg-[#fffcf7] text-[var(--muted)] hover:border-[var(--accent)]/40"
                  }`}
                >
                  Familiar
                </button>
                <button
                  type="button"
                  onClick={() => setContactRole("guardian")}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    contactRole === "guardian"
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--foreground)]"
                      : "border-[var(--border)] bg-[#fffcf7] text-[var(--muted)] hover:border-[var(--accent)]/40"
                  }`}
                >
                  Tutor/responsable
                </button>
                <button
                  type="button"
                  onClick={() => setContactRole("broker")}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    contactRole === "broker"
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--foreground)]"
                      : "border-[var(--border)] bg-[#fffcf7] text-[var(--muted)] hover:border-[var(--accent)]/40"
                  }`}
                >
                  Inmobiliaria / martillero
                </button>
              </div>
              {contactRole === "broker" ? (
                <div className="mt-3 md:col-span-2">
                  <Label htmlFor="ppc-company">Empresa / inmobiliaria</Label>
                  <Input
                    id="ppc-company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Razón social o nombre comercial"
                    className="mt-1"
                  />
                </div>
              ) : null}
              {contactRole === "family" ? (
                <div className="mt-3">
                  <Label htmlFor="ppc-rel">Relación</Label>
                  <Input
                    id="ppc-rel"
                    value={rel}
                    onChange={(e) => setRel(e.target.value)}
                    placeholder="Ej. Hijo/a, cónyuge…"
                    className="mt-1"
                  />
                </div>
              ) : null}
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="ppc-notes">Notas</Label>
              <Textarea id="ppc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1" />
            </div>
          </div>
          {err ? <p className="text-sm text-red-400">{err}</p> : null}
          <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={busy} onClick={() => void submitModal()}>
              {busy ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

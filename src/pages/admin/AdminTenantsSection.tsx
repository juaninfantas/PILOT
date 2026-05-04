import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Modal } from "../../components/ui/modal";
import { useAuth } from "../../contexts/AuthContext";
import { useOrganization } from "../../contexts/OrganizationContext";

type TenantRow = {
  id: string;
  slug: string;
  display_name: string;
  subscription_tier: string;
  member_count: number;
};

type MemberRow = {
  user_id: string;
  email: string | null;
  name: string | null;
  is_active: boolean;
  access_group_slug: string;
};

export function AdminTenantsSection() {
  const { user, refreshPermissions } = useAuth();
  const { refresh: refreshOrg } = useOrganization();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newInviteOverride, setNewInviteOverride] = useState("");
  const [lastCreated, setLastCreated] = useState<{ slug: string; code: string } | null>(null);

  const [attachEmail, setAttachEmail] = useState("");
  const [attachAccess, setAttachAccess] = useState<"admin" | "consulta">("admin");
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const loadTenants = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("staff_list_tenants", { p_limit: 300 });
    if (error) setMsg(error.message);
    else {
      setMsg(null);
      setTenants(
        (data as TenantRow[] | null)?.map((r) => ({
          ...r,
          member_count: Number(r.member_count),
        })) ?? [],
      );
    }
    setLoading(false);
  }, []);

  const loadMembers = useCallback(async (orgId: string) => {
    const { data, error } = await supabase.rpc("staff_list_tenant_members", {
      p_organization_id: orgId,
    });
    if (error) setMsg(error.message);
    else {
      setMsg(null);
      setMembers((data as MemberRow[]) ?? []);
    }
    const { data: code, error: cErr } = await supabase.rpc("staff_get_tenant_invite_code", {
      p_organization_id: orgId,
    });
    if (!cErr && code != null) setInviteCode(String(code));
    else setInviteCode(null);
  }, []);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    if (selectedId) void loadMembers(selectedId);
    else {
      setMembers([]);
      setInviteCode(null);
    }
  }, [selectedId, loadMembers]);

  async function createTenant(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const slug = newSlug.trim().toLowerCase();
    const name = newName.trim();
    if (!slug || !name) {
      setMsg("Slug y nombre son obligatorios.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const inviteArg = newInviteOverride.trim() || null;
    const { data, error } = await supabase.rpc("staff_create_tenant", {
      p_slug: slug,
      p_display_name: name,
      p_signup_invite_code: inviteArg,
    });
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setMsg(null);
    const row = Array.isArray(data) ? data[0] : null;
    if (row && typeof row === "object" && "signup_invite_code" in row) {
      const r = row as { slug: string; signup_invite_code: string };
      setLastCreated({ slug: r.slug, code: String(r.signup_invite_code) });
    }
    setNewSlug("");
    setNewName("");
    setNewInviteOverride("");
    setCreateModalOpen(false);
    void loadTenants();
  }

  async function toggleMemberActive(m: MemberRow) {
    if (!selectedId || busy || m.user_id === user?.id) return;
    setBusy(true);
    const { error } = await supabase.rpc("staff_set_tenant_member_active", {
      p_organization_id: selectedId,
      p_user_id: m.user_id,
      p_is_active: !m.is_active,
    });
    setBusy(false);
    if (error) setMsg(error.message);
    else {
      setMsg(m.is_active ? "Usuario desactivado." : "Usuario reactivado.");
      void loadMembers(selectedId);
      void loadTenants();
      void refreshPermissions();
    }
  }

  async function setMemberAccess(m: MemberRow, access: "admin" | "consulta") {
    if (!selectedId || busy || m.user_id === user?.id) return;
    setBusy(true);
    const { error } = await supabase.rpc("staff_set_tenant_member_access", {
      p_organization_id: selectedId,
      p_user_id: m.user_id,
      p_access: access,
    });
    setBusy(false);
    if (error) setMsg(error.message);
    else {
      setMsg("Acceso actualizado.");
      void loadMembers(selectedId);
      void refreshPermissions();
    }
  }

  async function attachUserByEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || busy) return;
    const email = attachEmail.trim().toLowerCase();
    if (!email) {
      setMsg("Ingresá un email.");
      return;
    }
    if (
      !window.confirm(
        "Esta acción mueve al usuario a esta inmobiliaria: pierde la membresía anterior y queda sólo aquí. ¿Continuar?",
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    const { data: uid, error: fErr } = await supabase.rpc("staff_find_user_by_email", { p_email: email });
    if (fErr || !uid) {
      setBusy(false);
      setMsg(fErr?.message ?? "No hay usuario registrado con ese email.");
      return;
    }
    const { error } = await supabase.rpc("staff_attach_user_to_tenant", {
      p_user_id: uid as string,
      p_organization_id: selectedId,
      p_access: attachAccess,
    });
    setBusy(false);
    if (error) setMsg(error.message);
    else {
      setMsg("Usuario vinculado a la inmobiliaria.");
      setAttachEmail("");
      void loadMembers(selectedId);
      void loadTenants();
      void refreshOrg();
      void refreshPermissions();
    }
  }

  return (
    <div className="space-y-10">
      <Modal
        open={createModalOpen}
        title="Nueva inmobiliaria"
        onClose={() => {
          if (!busy) setCreateModalOpen(false);
        }}
        panelClassName="max-w-xl"
        footer={
          <>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setCreateModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="create-tenant-form" disabled={busy} className="jif-btn-primary">
              {busy ? "Creando…" : "Crear tenant"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--muted)]">
          Slug único y nombre visible. Se genera un código de invitación para el alta en registro, o podés fijar uno propio.
          Se copian funnels desde la organización <code className="text-xs">default</code>.
        </p>
        <form id="create-tenant-form" onSubmit={(ev) => void createTenant(ev)} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-1">
            <Label htmlFor="nt-slug">Slug (URL) *</Label>
            <Input
              id="nt-slug"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              placeholder="inmobiliaria-lopez"
              className="mt-1 font-mono text-sm"
              autoComplete="off"
            />
          </div>
          <div className="sm:col-span-1">
            <Label htmlFor="nt-name">Nombre *</Label>
            <Input
              id="nt-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="López Propiedades"
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="nt-inv">Código de invitación (opcional)</Label>
            <Input
              id="nt-inv"
              value={newInviteOverride}
              onChange={(e) => setNewInviteOverride(e.target.value)}
              placeholder="Vacío = generar automático"
              className="mt-1"
            />
          </div>
        </form>
        {createModalOpen && msg ? <p className="text-sm text-red-600">{msg}</p> : null}
      </Modal>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Inmobiliarias</h2>
          <Button
            type="button"
            className="jif-btn-primary"
            onClick={() => {
              setMsg(null);
              setCreateModalOpen(true);
            }}
          >
            Crear tenant
          </Button>
        </div>
        {lastCreated ? (
          <div className="rounded-lg border border-[var(--jif-gold)]/40 bg-[#fffcf7] p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-medium text-[var(--foreground)]">Tenant creado</p>
              <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 text-xs" onClick={() => setLastCreated(null)}>
                Cerrar
              </Button>
            </div>
            <p className="mt-2 text-[var(--muted)]">
              Slug: <span className="font-mono text-[var(--foreground)]">{lastCreated.slug}</span>
            </p>
            <p className="mt-1 text-[var(--muted)]">
              Código de invitación:{" "}
              <span className="font-mono font-semibold text-[var(--foreground)]">{lastCreated.code}</span>
            </p>
            <p className="mt-2 text-xs text-[var(--muted)]">
              El cliente se registra con ese slug y código (misma pantalla de registro actual).
            </p>
          </div>
        ) : null}
        {loading ? <p className="text-sm text-[var(--muted)]">Cargando…</p> : null}
        {msg && !createModalOpen ? <p className="text-sm text-[var(--accent)]">{msg}</p> : null}
        <div className="overflow-x-auto rounded-xl border border-[var(--jif-line)]">
          <table className="jif-table w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="jif-caps jif-dim border-b border-[var(--jif-line)]">
                <th className="py-3 pl-4 font-medium sm:pl-5">Nombre</th>
                <th className="py-3 font-medium">Slug</th>
                <th className="py-3 font-medium">Plan</th>
                <th className="py-3 font-medium">Usuarios</th>
                <th className="w-28 py-3 text-right font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr
                  key={t.id}
                  className={`border-b border-[var(--jif-line)]/60 ${selectedId === t.id ? "bg-[var(--card)]" : ""}`}
                >
                  <td className="py-3 pl-4 sm:pl-5">{t.display_name}</td>
                  <td className="py-3 font-mono text-xs text-[var(--muted)]">{t.slug}</td>
                  <td className="py-3 text-[var(--muted)]">{t.subscription_tier}</td>
                  <td className="py-3 text-[var(--muted)]">{t.member_count}</td>
                  <td className="py-3 text-right">
                    <Button
                      type="button"
                      variant={selectedId === t.id ? "neo" : "ghost"}
                      size="sm"
                      onClick={() => setSelectedId(selectedId === t.id ? null : t.id)}
                    >
                      {selectedId === t.id ? "Cerrar" : "Gestionar"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedId ? (
        <section className="space-y-6 rounded-xl border border-[var(--jif-line)] bg-[var(--card)] p-6">
          <h3 className="text-base font-semibold">Usuarios del tenant</h3>
          {inviteCode ? (
            <p className="text-sm text-[var(--muted)]">
              Código de invitación actual:{" "}
              <span className="font-mono font-medium text-[var(--foreground)]">{inviteCode}</span>
            </p>
          ) : null}

          <form onSubmit={(ev) => void attachUserByEmail(ev)} className="flex flex-wrap items-end gap-3 border-b border-[var(--jif-line)] pb-6">
            <div className="min-w-[200px] flex-1">
              <Label htmlFor="att-email">Vincular usuario existente (email)</Label>
              <Input
                id="att-email"
                type="email"
                value={attachEmail}
                onChange={(e) => setAttachEmail(e.target.value)}
                placeholder="correo@cliente.com"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="att-acc">Perfil</Label>
              <select
                id="att-acc"
                value={attachAccess}
                onChange={(e) => setAttachAccess(e.target.value as "admin" | "consulta")}
                className="mt-1 flex h-10 rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
              >
                <option value="admin">Administrador</option>
                <option value="consulta">Solo consulta</option>
              </select>
            </div>
            <Button type="submit" variant="secondary" disabled={busy}>
              Vincular
            </Button>
          </form>

          <div className="overflow-x-auto">
            <table className="jif-table w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="jif-caps jif-dim border-b border-[var(--jif-line)]">
                  <th className="py-2 pl-2 font-medium">Email</th>
                  <th className="py-2 font-medium">Nombre</th>
                  <th className="py-2 font-medium">Acceso</th>
                  <th className="py-2 font-medium">Estado</th>
                  <th className="py-2 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_id} className="border-b border-[var(--jif-line)]/60">
                    <td className="py-2 pl-2">{m.email ?? "—"}</td>
                    <td className="py-2">{m.name ?? "—"}</td>
                    <td className="py-2">
                      <span className="text-[var(--muted)]">{m.access_group_slug}</span>
                    </td>
                    <td className="py-2">{m.is_active ? "Activo" : "Desactivado"}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy || m.user_id === user?.id}
                          onClick={() => void toggleMemberActive(m)}
                        >
                          {m.is_active ? "Desactivar" : "Activar"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy || m.user_id === user?.id || m.access_group_slug === "admins"}
                          onClick={() => void setMemberAccess(m, "admin")}
                        >
                          Admin
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy || m.user_id === user?.id || m.access_group_slug === "consulta"}
                          onClick={() => void setMemberAccess(m, "consulta")}
                        >
                          Consulta
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

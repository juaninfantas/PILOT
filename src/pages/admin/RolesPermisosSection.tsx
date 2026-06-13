import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { RequirePermission } from "../../components/RequirePermission";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Modal } from "../../components/ui/modal";
import {
  PERMISSION_ACTION_LABEL,
  PERMISSION_MODULES,
  type PermissionAction,
  permissionSlug,
} from "../../lib/permission-catalog";

type RoleRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_system: boolean;
  member_count: number;
};

type RoleEditModalProps = {
  open: boolean;
  role: RoleRow | null;
  isNew: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function RoleEditModal({ open, role, isNew, onClose, onSaved }: RoleEditModalProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [moduleFilter, setModuleFilter] = useState("ALL");
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMsg(null);
    if (isNew) {
      setName("");
      setSlug("");
      setDescription("");
      setGranted(new Set());
      return;
    }
    if (!role) return;
    setName(role.name);
    setSlug(role.slug);
    setDescription(role.description ?? "");
    void (async () => {
      const { data, error } = await supabase.rpc("get_role_permission_slugs", { p_role_id: role.id });
      if (error) {
        setMsg(error.message);
        setGranted(new Set());
        return;
      }
      setGranted(new Set((data as string[]) ?? []));
    })();
  }, [open, isNew, role]);

  const modules = useMemo(() => {
    if (moduleFilter === "ALL") return PERMISSION_MODULES;
    return PERMISSION_MODULES.filter((m) => m.module === moduleFilter);
  }, [moduleFilter]);

  function toggle(slugKey: string) {
    setGranted((prev) => {
      const next = new Set(prev);
      if (next.has(slugKey)) next.delete(slugKey);
      else next.add(slugKey);
      return next;
    });
  }

  function toggleColumn(mod: string, action: PermissionAction, on: boolean) {
    setGranted((prev) => {
      const next = new Set(prev);
      const modDef = PERMISSION_MODULES.find((m) => m.module === mod);
      if (!modDef) return prev;
      for (const res of modDef.resources) {
        if (!res.actions.includes(action)) continue;
        const s = permissionSlug(res.resource, action);
        if (on) next.add(s);
        else next.delete(s);
      }
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      let roleId = role?.id;
      if (isNew) {
        const { data, error } = await supabase.rpc("create_custom_role", {
          p_name: name.trim(),
          p_slug: slug.trim(),
          p_description: description.trim() || null,
        });
        if (error) throw error;
        roleId = data as string;
      } else if (roleId) {
        const { error } = await supabase.rpc("update_role_profile", {
          p_role_id: roleId,
          p_name: name.trim(),
          p_description: description.trim() || null,
        });
        if (error) throw error;
      }
      if (!roleId) throw new Error("Rol no creado");
      const { error: permErr } = await supabase.rpc("save_role_permissions", {
        p_role_id: roleId,
        p_slugs: [...granted],
      });
      if (permErr) throw permErr;
      onSaved();
      onClose();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setBusy(false);
    }
  }

  const canEditSlug = isNew;
  const canEditMatrix = !isNew || true;

  return (
    <Modal open={open} onClose={onClose} title={isNew ? "Nuevo rol" : "Editar rol"} panelClassName="max-w-4xl max-h-[90vh] overflow-y-auto">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="role-name">Nombre</Label>
            <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="role-slug">Código</Label>
            <Input
              id="role-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              disabled={!canEditSlug}
              placeholder="ej: vendedor_junior"
              className="mt-1 font-mono disabled:opacity-60"
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="role-desc">Descripción</Label>
            <Input id="role-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="mod-filter">Filtrar módulo</Label>
            <select
              id="mod-filter"
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
            >
              <option value="ALL">Todos</option>
              {PERMISSION_MODULES.map((m) => (
                <option key={m.module} value={m.module}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {msg ? <p className="text-sm text-red-600">{msg}</p> : null}

        {canEditMatrix ? (
          <div className="max-h-[50vh] overflow-auto rounded-lg border border-[var(--jif-line)]">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead className="sticky top-0 bg-[var(--card)]">
                <tr className="border-b border-[var(--jif-line)] text-xs uppercase tracking-wide text-[var(--muted)]">
                  <th className="py-2 pl-3 pr-2 text-left font-medium">Recurso</th>
                  {(["view", "create", "update", "delete"] as PermissionAction[]).map((act) => (
                    <th key={act} className="w-16 py-2 text-center font-medium">
                      {PERMISSION_ACTION_LABEL[act]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modules.map((mod) => (
                  <Fragment key={mod.module}>
                    <tr className="bg-[var(--background)]">
                      <td colSpan={5} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                        {mod.label}
                        <span className="ml-3 font-normal normal-case">
                          {(["view", "create", "update", "delete"] as PermissionAction[]).map((act) => (
                            <button
                              key={act}
                              type="button"
                              className="mr-2 text-[var(--accent)] hover:underline"
                              onClick={() => toggleColumn(mod.module, act, true)}
                            >
                              +{PERMISSION_ACTION_LABEL[act]}
                            </button>
                          ))}
                        </span>
                      </td>
                    </tr>
                    {mod.resources.map((res) => (
                      <tr key={res.resource} className="border-b border-[var(--jif-line)]/60">
                        <td className="py-2 pl-3 pr-2">
                          <span className="font-medium text-[var(--foreground)]">{res.label}</span>
                          <span className="mt-0.5 block font-mono text-[10px] text-[var(--muted)]">{res.resource}</span>
                        </td>
                        {(["view", "create", "update", "delete"] as PermissionAction[]).map((act) => {
                          const s = permissionSlug(res.resource, act);
                          const enabled = res.actions.includes(act);
                          return (
                            <td key={act} className="py-2 text-center">
                              {enabled ? (
                                <input
                                  type="checkbox"
                                  checked={granted.has(s)}
                                  onChange={() => toggle(s)}
                                  className="size-4 accent-[var(--accent)]"
                                  aria-label={`${res.label} ${PERMISSION_ACTION_LABEL[act]}`}
                                />
                              ) : (
                                <span className="text-[var(--muted)]">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-[var(--jif-line)] pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="neo" disabled={busy}>
            {busy ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function RolesPermisosSection() {
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editRole, setEditRole] = useState<RoleRow | null>(null);
  const [isNew, setIsNew] = useState(false);

  const load = useCallback(async () => {
    setMsg(null);
    const { data, error } = await supabase.rpc("list_roles_admin");
    if (error) {
      setMsg(error.message);
      setRows([]);
      return;
    }
    setRows(
      ((data as RoleRow[]) ?? []).map((r) => ({
        ...r,
        member_count: Number(r.member_count),
      })),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openNew() {
    setEditRole(null);
    setIsNew(true);
    setModalOpen(true);
  }

  function openEdit(r: RoleRow) {
    setEditRole(r);
    setIsNew(false);
    setModalOpen(true);
  }

  async function onDelete(r: RoleRow) {
    if (r.is_system) return;
    if (!window.confirm(`¿Eliminar el rol «${r.name}»?`)) return;
    const { error } = await supabase.rpc("delete_custom_role", { p_role_id: r.id });
    if (error) setMsg(error.message);
    else void load();
  }

  return (
    <RequirePermission slug="manage_roles">
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Roles y permisos</h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
              Definí qué puede ver, crear, modificar y eliminar cada rol en cada recurso. Luego asigná el rol a cada
              usuario del equipo.
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">{rows.length} registros</p>
          </div>
          <Button type="button" variant="neo" onClick={openNew}>
            <Plus className="mr-1 size-4" />
            Rol
          </Button>
        </div>

        {msg ? <p className="text-sm text-[var(--accent)]">{msg}</p> : null}

        <div className="overflow-x-auto rounded-xl border border-[var(--jif-line)]">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--jif-line)] text-xs uppercase tracking-wide text-[var(--muted)]">
                <th className="py-3 pl-4 pr-3 font-medium">Rol</th>
                <th className="py-3 pr-3 font-medium">Código</th>
                <th className="py-3 pr-3 font-medium">Tipo</th>
                <th className="py-3 pr-3 font-medium">Usuarios</th>
                <th className="py-3 pr-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--jif-line)]/60">
                  <td className="py-3 pl-4 pr-3 font-medium">{r.name}</td>
                  <td className="py-3 pr-3 font-mono text-xs text-[var(--muted)]">{r.slug}</td>
                  <td className="py-3 pr-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${r.is_system ? "bg-stone-200 text-stone-700" : "bg-[var(--accent)]/15 text-[var(--foreground)]"}`}
                    >
                      {r.is_system ? "Sistema" : "Custom"}
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-[var(--muted)]">{r.member_count}</td>
                  <td className="py-3 pr-4">
                    <div className="flex justify-end gap-1">
                      <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(r)} aria-label="Editar">
                        <Pencil className="size-4" />
                      </Button>
                      {!r.is_system ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={r.member_count > 0}
                          title={r.member_count > 0 ? "Quitar usuarios antes de eliminar" : "Eliminar"}
                          onClick={() => void onDelete(r)}
                          aria-label="Eliminar"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <RoleEditModal
          open={modalOpen}
          role={editRole}
          isNew={isNew}
          onClose={() => setModalOpen(false)}
          onSaved={() => void load()}
        />
      </section>
    </RequirePermission>
  );
}

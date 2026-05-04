import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { GripVertical, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useActiveOrganization } from "../../contexts/OrganizationContext";
import { useAuth } from "../../contexts/AuthContext";
import { hasPermission } from "../../lib/permissions";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Modal } from "../ui/modal";
import type { Database } from "../../types/database";

type Funnel = Database["public"]["Tables"]["Funnel"]["Row"];
type Stage = Database["public"]["Tables"]["FunnelStage"]["Row"];

export function FunnelEditorSection() {
  const org = useActiveOrganization();
  const { permissions } = useAuth();
  const canManage = hasPermission(permissions, "manage_opportunities");
  const [searchParams, setSearchParams] = useSearchParams();

  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [mode, setMode] = useState<"idle" | "new" | "edit">("idle");
  const [newName, setNewName] = useState("");
  const [newStageNames, setNewStageNames] = useState<string[]>(["Contacto", "Visita", "Oferta"]);
  const [editFunnelId, setEditFunnelId] = useState<string | null>(null);
  const [editFunnelName, setEditFunnelName] = useState("");
  const [editStages, setEditStages] = useState<{ id: string; name: string }[]>([]);
  const [pending, setPending] = useState(false);
  const [deleteFunnelModal, setDeleteFunnelModal] = useState(false);

  const editDraggedStageIdRef = useRef<string | null>(null);
  const [editDragOverStageId, setEditDragOverStageId] = useState<string | null>(null);
  const [editDraggingStageId, setEditDraggingStageId] = useState<string | null>(null);

  const operationalFunnels = useMemo(() => funnels.filter((f) => !f.is_system).sort((a, b) => a.name.localeCompare(b.name, "es")), [funnels]);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: f }, { data: s }] = await Promise.all([
      supabase.from("Funnel").select("*").order("name"),
      supabase.from("FunnelStage").select("*").order("position"),
    ]);
    setFunnels((f as Funnel[]) ?? []);
    setStages((s as Stage[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get("newFunnel") !== "1") return;
    setMode("new");
    setSearchParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete("newFunnel");
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  function slugFromName(name: string) {
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  async function createFunnel() {
    if (!canManage || !newName.trim()) return;
    setPending(true);
    setMsg(null);
    const trimmed = newName.trim();
    const names = newStageNames.map((x) => x.trim()).filter(Boolean);
    if (!names.length) {
      setMsg("Agregá al menos una etapa.");
      setPending(false);
      return;
    }
    const slug = slugFromName(trimmed);
    let ins = await supabase
      .from("Funnel")
      .insert({
        organization_id: org.id,
        name: trimmed,
        slug,
        is_system: false,
        system_type: "NORMAL",
      })
      .select("id")
      .single();
    if (ins.error && /is_system|system_type/.test(ins.error.message)) {
      ins = await supabase.from("Funnel").insert({ organization_id: org.id, name: trimmed, slug }).select("id").single();
    }
    if (ins.error || !ins.data) {
      setMsg(ins.error?.message ?? "No se pudo crear el funnel");
      setPending(false);
      return;
    }
    const funnelId = ins.data.id as string;
    for (let i = 0; i < names.length; i++) {
      const { error: se } = await supabase.from("FunnelStage").insert({
        funnel_id: funnelId,
        name: names[i],
        position: i + 1,
      });
      if (se) {
        setMsg(se.message);
        setPending(false);
        return;
      }
    }
    setPending(false);
    setMsg("Funnel creado.");
    setMode("idle");
    setNewName("");
    setNewStageNames(["Contacto", "Visita", "Oferta"]);
    await load();
  }

  function openEdit(f: Funnel) {
    setEditFunnelId(f.id);
    setEditFunnelName(f.name);
    const rows = stages
      .filter((s) => s.funnel_id === f.id)
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ id: s.id, name: s.name }));
    setEditStages(rows);
    setMode("edit");
    setMsg(null);
  }

  const isTempStageId = (id: string) => id.startsWith("temp-");

  async function countOppsInFunnel(funnelId: string) {
    const { count, error } = await supabase
      .from("Opportunity")
      .select("id", { count: "exact", head: true })
      .eq("funnel_id", funnelId);
    if (error) return -1;
    return count ?? 0;
  }

  async function countOppsInStage(stageId: string) {
    const { count, error } = await supabase
      .from("Opportunity")
      .select("id", { count: "exact", head: true })
      .eq("stage_id", stageId);
    if (error) return -1;
    return count ?? 0;
  }

  async function saveEdit() {
    if (!canManage || !editFunnelId) return;
    setPending(true);
    setMsg(null);
    const nameTrim = editFunnelName.trim();
    if (!nameTrim) {
      setMsg("El nombre del funnel es obligatorio.");
      setPending(false);
      return;
    }
    const slug = slugFromName(nameTrim);
    const { error: ue } = await supabase.from("Funnel").update({ name: nameTrim, slug }).eq("id", editFunnelId).eq("is_system", false);
    if (ue) {
      setMsg(ue.message);
      setPending(false);
      return;
    }

    const validRows = editStages.filter((r) => r.name.trim());
    if (!validRows.length) {
      setMsg("Debe haber al menos una etapa con nombre.");
      setPending(false);
      return;
    }

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const nm = row.name.trim();
      if (isTempStageId(row.id)) {
        const { error } = await supabase.from("FunnelStage").insert({
          funnel_id: editFunnelId,
          name: nm,
          position: i + 1,
        });
        if (error) {
          setMsg(error.message);
          setPending(false);
          return;
        }
      } else {
        const { error } = await supabase.from("FunnelStage").update({ name: nm, position: i + 1 }).eq("id", row.id);
        if (error) {
          setMsg(error.message);
          setPending(false);
          return;
        }
      }
    }

    setPending(false);
    await load();
    setMode("idle");
    setEditFunnelId(null);
  }

  async function removeStage(rowId: string) {
    if (!canManage) return;
    if (isTempStageId(rowId)) {
      setEditStages((prev) => prev.filter((r) => r.id !== rowId));
      return;
    }
    const n = await countOppsInStage(rowId);
    if (n < 0) {
      setMsg("No se pudo verificar oportunidades.");
      return;
    }
    if (n > 0) {
      setMsg(`No podés eliminar esta etapa: hay ${n} oportunidad(es) asignada(s).`);
      return;
    }
    if (!window.confirm("¿Eliminar esta etapa?")) return;
    const { error } = await supabase.from("FunnelStage").delete().eq("id", rowId);
    if (error) setMsg(error.message);
    else {
      setEditStages((prev) => prev.filter((r) => r.id !== rowId));
      setMsg("Etapa eliminada.");
      await load();
    }
  }

  function reorderEditStages(fromId: string, toId: string) {
    setEditStages((prev) => {
      const fromIdx = prev.findIndex((r) => r.id === fromId);
      const toIdx = prev.findIndex((r) => r.id === toId);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;
      const next = [...prev];
      const [removed] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, removed);
      return next;
    });
  }

  async function confirmDeleteFunnel() {
    if (!editFunnelId) return;
    const total = await countOppsInFunnel(editFunnelId);
    if (total < 0) {
      setMsg("No se pudo verificar oportunidades.");
      return;
    }
    if (total > 0) {
      setMsg(`No podés eliminar el funnel: hay ${total} oportunidad(es) en sus etapas.`);
      setDeleteFunnelModal(false);
      return;
    }
    setPending(true);
    const stageIds = stages.filter((s) => s.funnel_id === editFunnelId).map((s) => s.id);
    for (const sid of stageIds) {
      await supabase.from("FunnelStage").delete().eq("id", sid);
    }
    const { error } = await supabase.from("Funnel").delete().eq("id", editFunnelId).eq("is_system", false);
    setPending(false);
    setDeleteFunnelModal(false);
    if (error) setMsg(error.message);
    else {
      setMsg("Funnel eliminado.");
      setMode("idle");
      setEditFunnelId(null);
      await load();
    }
  }

  if (!canManage) {
    return (
      <p className="text-sm text-[var(--muted)]">Necesitás permiso para gestionar oportunidades y funnels.</p>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-[var(--foreground)]">Funnels</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          El orden de las etapas (arriba → abajo) es el mismo que las columnas del tablero (izquierda → derecha).
        </p>
      </div>
      {msg ? <p className="text-sm text-[var(--accent)]">{msg}</p> : null}
      {loading ? <p className="text-sm text-[var(--muted)]">Cargando…</p> : null}

      {mode === "idle" ? (
        <div className="space-y-4">
          <Button type="button" variant="neo" onClick={() => { setMode("new"); setMsg(null); }}>
            Nuevo funnel
          </Button>
          <ul className="divide-y divide-[var(--jif-line)] rounded-xl border border-[var(--jif-line)]">
            {operationalFunnels.length === 0 ? (
              <li className="px-4 py-6 text-sm text-[var(--muted)]">No hay funnels operativos. Creá uno para armar etapas.</li>
            ) : (
              operationalFunnels.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span className="font-medium">{f.name}</span>
                  <Button type="button" variant="secondary" size="sm" onClick={() => openEdit(f)}>
                    Editar funnel
                  </Button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {mode === "new" ? (
        <div className="jif-panel space-y-4 p-5">
          <h3 className="text-lg font-medium">Nuevo funnel</h3>
          <div>
            <Label htmlFor="nf-name">Nombre del funnel</Label>
            <Input
              id="nf-name"
              className="mt-1"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ej. Comercial"
            />
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">Etapas (orden en el tablero)</p>
            <ul className="mt-2 space-y-2">
              {newStageNames.map((n, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-xs text-[var(--muted)]">{i + 1}</span>
                  <Input
                    value={n}
                    onChange={(e) => {
                      const next = [...newStageNames];
                      next[i] = e.target.value;
                      setNewStageNames(next);
                    }}
                    placeholder={`Etapa ${i + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={newStageNames.length <= 1}
                    onClick={() => setNewStageNames((prev) => prev.filter((_, j) => j !== i))}
                  >
                    Quitar
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => setNewStageNames((prev) => [...prev, ""])}
            >
              Agregar etapa
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="neo" disabled={pending} onClick={() => void createFunnel()}>
              {pending ? "Guardando…" : "Crear funnel"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setMode("idle"); setMsg(null); }}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "edit" && editFunnelId ? (
        <div className="jif-panel space-y-4 p-5">
          <h3 className="text-lg font-medium">Editar funnel</h3>
          <div>
            <Label htmlFor="ef-name">Nombre</Label>
            <Input id="ef-name" className="mt-1" value={editFunnelName} onChange={(e) => setEditFunnelName(e.target.value)} />
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">Etapas</p>
            <ul className="mt-2 space-y-2">
              {editStages.map((row, i) => (
                <li
                  key={row.id}
                  className={[
                    "flex min-w-0 flex-nowrap items-center gap-2 rounded-lg border border-transparent px-1 py-0.5 transition-colors",
                    editDragOverStageId === row.id && editDraggingStageId !== row.id
                      ? "border-[var(--jif-gold)] bg-[var(--jif-gold)]/10"
                      : "",
                    editDraggingStageId === row.id ? "opacity-60" : "",
                  ].join(" ")}
                  onDragOver={(e) => {
                    const fromId = editDraggedStageIdRef.current;
                    if (!fromId || fromId === row.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setEditDragOverStageId(row.id);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setEditDragOverStageId(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const fromId = e.dataTransfer.getData("text/plain") || editDraggedStageIdRef.current;
                    editDraggedStageIdRef.current = null;
                    setEditDragOverStageId(null);
                    setEditDraggingStageId(null);
                    if (!fromId || fromId === row.id) return;
                    reorderEditStages(fromId, row.id);
                  }}
                >
                  <button
                    type="button"
                    draggable
                    className="shrink-0 cursor-grab rounded border border-[var(--jif-line)] p-1.5 text-[var(--muted)] touch-none hover:bg-stone-900/5 active:cursor-grabbing self-center"
                    title="Arrastrar para reordenar"
                    aria-label="Arrastrar para reordenar"
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", row.id);
                      e.dataTransfer.effectAllowed = "move";
                      editDraggedStageIdRef.current = row.id;
                      setEditDraggingStageId(row.id);
                    }}
                    onDragEnd={() => {
                      editDraggedStageIdRef.current = null;
                      setEditDraggingStageId(null);
                      setEditDragOverStageId(null);
                    }}
                  >
                    <GripVertical className="size-4" />
                  </button>
                  <Input
                    className="min-w-0 flex-1"
                    value={row.name}
                    onChange={(e) => {
                      const next = [...editStages];
                      next[i] = { ...row, name: e.target.value };
                      setEditStages(next);
                    }}
                    placeholder="Nombre de etapa"
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded p-1.5 text-red-700 hover:bg-red-50 self-center"
                    title="Eliminar etapa"
                    onClick={() => void removeStage(row.id)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => setEditStages((p) => [...p, { id: `temp-${crypto.randomUUID()}`, name: "" }])}
            >
              Agregar etapa
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-[var(--jif-line)] pt-4">
            <Button type="button" variant="neo" disabled={pending} onClick={() => void saveEdit()}>
              {pending ? "Guardando…" : "Guardar cambios"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setMode("idle"); setEditFunnelId(null); setMsg(null); }}>
              Cerrar
            </Button>
            <Button type="button" variant="danger" className="ml-auto" onClick={() => setDeleteFunnelModal(true)}>
              Eliminar funnel
            </Button>
          </div>
        </div>
      ) : null}

      <Modal
        open={deleteFunnelModal}
        title="Eliminar funnel"
        onClose={() => setDeleteFunnelModal(false)}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setDeleteFunnelModal(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="danger" disabled={pending} onClick={() => void confirmDeleteFunnel()}>
              Sí, eliminar
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Solo se puede eliminar si no hay ninguna oportunidad en ninguna etapa de este funnel. ¿Seguro?
        </p>
      </Modal>
    </div>
  );
}

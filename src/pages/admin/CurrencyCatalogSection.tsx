import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Save } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { Database } from "../../types/database";
import { useCurrencyCatalog } from "../../contexts/CurrencyCatalogContext";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Modal } from "../../components/ui/modal";

type Row = Database["public"]["Tables"]["CurrencyCatalog"]["Row"];

type CurrencyCatalogSectionProps = { embedded?: boolean };

function normalizeCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
}

function mapCurrencyMutateError(msg: string): string {
  if (msg.includes("ERR_AUTH") || msg.includes("ERR_DENIED")) return "No tenés permiso para esta acción.";
  if (msg.includes("ERR_NOT_FOUND")) return "La moneda ya no existe. Recargá la lista.";
  if (msg.includes("ERR_DUPLICATE_CODE")) return "Ya existe una moneda con ese código.";
  if (msg.includes("ERR_INVALID_CODE")) return "El código debe ser tres letras mayúsculas (ej. USD, ARS).";
  if (msg.includes("ERR_NAME_REQUIRED")) return "El nombre es obligatorio.";
  return msg;
}

export function CurrencyCatalogSection({ embedded = false }: CurrencyCatalogSectionProps) {
  const { refresh } = useCurrencyCatalog();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [savingCreate, setSavingCreate] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editOriginalCode, setEditOriginalCode] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("CurrencyCatalog").select("*").order("name");
    setLoading(false);
    if (error) {
      setErr(error.message);
      setRows([]);
      return;
    }
    setErr(null);
    setRows((data as Row[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setErr(null);
    setMsg(null);
    setNewCode("");
    setNewName("");
    setCreateOpen(true);
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const code = normalizeCode(newCode);
    if (!/^[A-Z]{3}$/.test(code)) {
      setErr("El código debe ser exactamente 3 letras (ej. GBP, MXN).");
      return;
    }
    const name = newName.trim();
    if (!name) {
      setErr("El nombre es obligatorio.");
      return;
    }
    setSavingCreate(true);
    const { error } = await supabase.from("CurrencyCatalog").insert({ code, name });
    setSavingCreate(false);
    if (error) {
      if (error.code === "23505" || error.message.includes("duplicate")) setErr("Ya existe esa moneda (código duplicado).");
      else setErr(error.message);
      return;
    }
    setMsg(`Moneda ${code} creada.`);
    setCreateOpen(false);
    await load();
    await refresh();
  }

  function openEdit(r: Row) {
    setErr(null);
    setMsg(null);
    setEditOriginalCode(r.code);
    setEditCode(r.code);
    setEditName(r.name);
    setEditOpen(true);
  }

  async function submitEditSave() {
    setErr(null);
    setMsg(null);
    const nextCode = normalizeCode(editCode);
    if (!/^[A-Z]{3}$/.test(nextCode)) {
      setErr("El código debe ser exactamente 3 letras.");
      return;
    }
    const name = editName.trim();
    if (!name) {
      setErr("El nombre es obligatorio.");
      return;
    }
    setSavingEdit(true);
    const { error } = await supabase.rpc("mutate_currency_catalog", {
      p_old_code: editOriginalCode,
      p_new_code: nextCode,
      p_name: name,
    });
    setSavingEdit(false);
    if (error) {
      setErr(mapCurrencyMutateError(error.message));
      return;
    }
    const label = nextCode === editOriginalCode ? nextCode : `${editOriginalCode} → ${nextCode}`;
    setMsg(`Moneda ${label} guardada.`);
    setEditOpen(false);
    await load();
    await refresh();
  }

  async function submitEditDelete() {
    const codeRef = editOriginalCode;
    if (
      !window.confirm(
        `¿Eliminar «${codeRef}» del catálogo? Las cotizaciones y precios históricos pueden seguir mostrando ese código como texto.`,
      )
    ) {
      return;
    }
    setErr(null);
    setMsg(null);
    setSavingEdit(true);
    const { error } = await supabase.from("CurrencyCatalog").delete().eq("code", codeRef);
    setSavingEdit(false);
    if (error) setErr(error.message);
    else {
      setMsg(`${codeRef} eliminada del catálogo.`);
      setEditOpen(false);
      await load();
      await refresh();
    }
  }

  const Wrapper: "section" | "div" = embedded ? "div" : "section";
  const wrapClassName = embedded
    ? "space-y-6"
    : "scroll-mt-6 space-y-6 rounded-xl border border-[var(--jif-line)] bg-[var(--card)] p-6";

  return (
    <Wrapper {...(!embedded ? { id: "currency-catalog" as const } : {})} className={wrapClassName}>
      <Modal
        open={createOpen}
        title="Nueva moneda"
        panelClassName="max-w-md"
        onClose={() => !savingCreate && setCreateOpen(false)}
        footer={
          <>
            <Button type="button" variant="ghost" disabled={savingCreate} onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="currency-create-form"
              disabled={savingCreate}
              className="jif-btn-primary inline-flex h-10 min-w-10 items-center justify-center px-3"
              aria-label="Guardar"
              title="Guardar"
            >
              {savingCreate ? <Loader2 className="size-5 shrink-0 animate-spin" /> : <Save className="size-5 shrink-0" />}
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--muted)]">Código ISO 4217 (tres letras) y nombre que verán los usuarios.</p>
        <form id="currency-create-form" onSubmit={(e) => void submitCreate(e)} className="space-y-4">
          <div>
            <Label htmlFor="cur-new-code">Código</Label>
            <Input
              id="cur-new-code"
              maxLength={3}
              placeholder="Ej. GBP"
              className="mt-1 w-[6.5rem] uppercase"
              value={newCode}
              onChange={(e) => setNewCode(normalizeCode(e.target.value))}
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="cur-new-name">Nombre</Label>
            <Input id="cur-new-name" className="mt-1" placeholder="Ej. Libra esterlina" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
        </form>
      </Modal>

      <Modal
        open={editOpen}
        title="Editar moneda"
        panelClassName="max-w-md"
        onClose={() => !savingEdit && setEditOpen(false)}
        footer={
          <>
            <Button type="button" variant="ghost" disabled={savingEdit} onClick={() => setEditOpen(false)}>
              Cerrar
            </Button>
            <Button type="button" variant="danger" disabled={savingEdit} onClick={() => void submitEditDelete()}>
              Eliminar
            </Button>
            <Button
              type="button"
              disabled={savingEdit}
              className="jif-btn-primary inline-flex h-10 min-w-10 items-center justify-center px-3"
              onClick={() => void submitEditSave()}
              aria-label="Guardar"
              title="Guardar"
            >
              {savingEdit ? <Loader2 className="size-5 shrink-0 animate-spin" /> : <Save className="size-5 shrink-0" />}
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--muted)]">
          Si cambiás el código, se actualizan precios, tasaciones, preferencias de compradores, tipos de cambio y ofertas que usaban el código anterior.
        </p>
        <div className="space-y-4 pt-2">
          <div>
            <Label htmlFor="cur-edit-code">Código</Label>
            <Input
              id="cur-edit-code"
              maxLength={3}
              className="mt-1 w-[6.5rem] uppercase"
              value={editCode}
              onChange={(e) => setEditCode(normalizeCode(e.target.value))}
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="cur-edit-name">Nombre</Label>
            <Input id="cur-edit-name" className="mt-1" value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
        </div>
      </Modal>

      <div className={`flex flex-wrap items-start justify-between gap-3 ${embedded ? "" : "mt-0"}`}>
        <div className="min-w-0">
          <p className="jif-caps jif-dim" style={{ fontSize: "0.65rem" }}>
            Monedas
          </p>
          <h3 className="mt-2 text-lg font-semibold">Monedas</h3>
          <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
            Identificación <strong>ISO 4217</strong> (tres letras mayúsculas, ej. USD, ARS) y nombre visible en formularios y tipos de cambio.
            {embedded
              ? " También aparecen en los selectores del CRM al cargarse la lista desde base."
              : " La lista y los selectores del CRM siguen orden alfabético por nombre."}
          </p>
        </div>
        <Button type="button" className="jif-btn-primary shrink-0" onClick={() => openCreate()}>
          Nueva moneda
        </Button>
      </div>

      {err ? <p className={`text-sm text-red-600 ${embedded ? "mt-2" : "mt-3"}`}>{err}</p> : null}
      {msg ? (
        <p className={`text-sm text-[var(--accent)] ${embedded ? "mt-2" : "mt-3"}`}>{msg}</p>
      ) : null}

      <div className={`${embedded ? "mt-4" : "mt-6"}`}>
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Cargando…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-[var(--jif-line)] px-4 py-8 text-center text-sm text-[var(--muted)]">
            Sin datos (ejecutá la migración de CurrencyCatalog).
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--jif-line)]">
            <table className="jif-table w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="jif-caps jif-dim border-b border-[var(--jif-line)]">
                  <th className="px-3 py-3 pl-4 font-medium sm:pl-5">Código</th>
                  <th className="px-3 py-3 font-medium">Nombre</th>
                  <th scope="col" className="w-28 whitespace-nowrap px-3 py-3 pr-4 text-right font-medium sm:pr-5" aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code} className="border-b border-[var(--jif-line)]/60">
                    <td className="px-3 py-3 pl-4 font-mono text-xs text-[var(--muted)] sm:pl-5">{r.code}</td>
                    <td className="px-3 py-3 text-[var(--foreground)]">{r.name}</td>
                    <td className="px-3 py-3 pr-4 text-right sm:pr-5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="inline-flex rounded-md p-2 text-[var(--accent)] hover:bg-stone-900/5"
                          title="Editar moneda"
                          aria-label="Editar moneda"
                          onClick={() => openEdit(r)}
                        >
                          <Pencil className="size-4" strokeWidth={1.75} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-6 text-xs text-[var(--muted)]">
        {embedded ? (
          <>
            Para <strong>cotizaciones por par</strong> definí tasas en <strong>Configuración</strong> (sección Tipos de cambio).
          </>
        ) : (
          <>
            Para <strong>cotizaciones por par</strong> usá la sección <strong>Tipos de cambio</strong> debajo en esta misma pestaña.
          </>
        )}
      </p>
    </Wrapper>
  );
}

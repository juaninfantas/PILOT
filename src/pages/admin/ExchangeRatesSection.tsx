import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { useOrganization } from "../../contexts/OrganizationContext";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Modal } from "../../components/ui/modal";
import { useCurrencyCatalog } from "../../contexts/CurrencyCatalogContext";
import { combineLocalDateTime, todayDateInputValue } from "../../lib/datetime-form";
import {
  EXCHANGE_USE_LABELS,
  effectiveQuoteForUse,
  parseUseVariant,
  type ExchangeUseVariant,
} from "../../lib/exchange-rate";
import type { Database } from "../../types/database";

type Row = Database["public"]["Tables"]["ExchangeRate"]["Row"];

const selectClass = "mt-1 flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm";

function fmtImporte(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  const maxFrac = n >= 1 ? 4 : 8;
  return n.toLocaleString("es-AR", { maximumFractionDigits: maxFrac });
}

/** YYYY-MM-DD en calendario local para comparar con filtros de fecha. */
function localDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ExchangeRatesSection() {
  const { options: currencyOptions } = useCurrencyCatalog();
  const { user } = useAuth();
  const { organization } = useOrganization();
  const orgId = organization?.id ?? null;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [currencyFrom, setCurrencyFrom] = useState("USD");
  const [currencyTo, setCurrencyTo] = useState("ARS");
  const [quoteBuy, setQuoteBuy] = useState("");
  const [quoteSell, setQuoteSell] = useState("");
  const [useVariant, setUseVariant] = useState<ExchangeUseVariant>("MID");
  const [effectiveAt, setEffectiveAt] = useState(todayDateInputValue);
  const [saving, setSaving] = useState(false);

  /** "" = todas las monedas base */
  const [filterDe, setFilterDe] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const load = useCallback(async () => {
    if (!orgId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("ExchangeRate")
      .select("*")
      .eq("organization_id", orgId)
      .order("currency_from")
      .order("currency_to")
      .order("effective_at", { ascending: false });
    setLoading(false);
    if (error) {
      setErr(error.message);
      setRows([]);
      return;
    }
    setErr(null);
    setRows((data as Row[]) ?? []);
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const distinctCurrencyFrom = useMemo(() => {
    const s = new Set(rows.map((r) => r.currency_from));
    return [...s].sort((a, b) => a.localeCompare(b, "es"));
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filterDe && r.currency_from !== filterDe) return false;
      const dayKey = localDateKey(r.effective_at);
      if (!dayKey) return false;
      if (filterDateFrom && dayKey < filterDateFrom) return false;
      if (filterDateTo && dayKey > filterDateTo) return false;
      return true;
    });
  }, [rows, filterDe, filterDateFrom, filterDateTo]);

  const groupedByFrom = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of filteredRows) {
      const k = r.currency_from;
      const list = m.get(k) ?? [];
      list.push(r);
      m.set(k, list);
    }
    for (const list of m.values()) {
      list.sort((a, b) => new Date(b.effective_at).getTime() - new Date(a.effective_at).getTime());
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, "es"));
  }, [filteredRows]);

  const importeUtilizarPreview = useMemo(() => {
    const buy = Number(String(quoteBuy).replace(",", "."));
    const sell = Number(String(quoteSell).replace(",", "."));
    const mock: Pick<Row, "quote_buy" | "quote_sell" | "use_variant"> = {
      quote_buy: String(buy),
      quote_sell: String(sell),
      use_variant: useVariant,
    };
    return effectiveQuoteForUse(mock);
  }, [quoteBuy, quoteSell, useVariant]);

  function resetFormDefaults() {
    setCurrencyFrom("USD");
    setCurrencyTo("ARS");
    setQuoteBuy("");
    setQuoteSell("");
    setUseVariant("MID");
    setEffectiveAt(todayDateInputValue);
    setEditingId(null);
  }

  function openCreate() {
    setErr(null);
    setEditOpen(false);
    resetFormDefaults();
    setCreateOpen(true);
  }

  function openEdit(r: Row) {
    setErr(null);
    setCreateOpen(false);
    setEditingId(r.id);
    setCurrencyFrom(r.currency_from);
    setCurrencyTo(r.currency_to);
    setQuoteBuy(String(r.quote_buy));
    setQuoteSell(String(r.quote_sell));
    setUseVariant(parseUseVariant(r.use_variant));
    const d = new Date(r.effective_at);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    setEffectiveAt(`${y}-${m}-${day}`);
    setEditOpen(true);
  }

  function closeModals() {
    setCreateOpen(false);
    setEditOpen(false);
    setSaving(false);
    setEditingId(null);
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setErr(null);
    const from = currencyFrom.trim().toUpperCase();
    const to = currencyTo.trim().toUpperCase();
    if (from === to) {
      setErr("Elegí dos monedas distintas.");
      return;
    }
    const buy = Number(String(quoteBuy).replace(",", "."));
    const sell = Number(String(quoteSell).replace(",", "."));
    if (!Number.isFinite(buy) || buy <= 0 || !Number.isFinite(sell) || sell <= 0) {
      setErr("Ingresá valores numéricos positivos en compra y venta.");
      return;
    }
    const iso = combineLocalDateTime(String(effectiveAt).trim(), "00:00");
    if (!iso) {
      setErr("Elegí una fecha de vigencia válida.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("ExchangeRate").insert({
      organization_id: orgId,
      currency_from: from,
      currency_to: to,
      effective_at: iso,
      quote_buy: buy,
      quote_sell: sell,
      use_variant: useVariant,
      source: "MANUAL",
      created_by_id: user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      if (error.message.includes("duplicate") || error.code === "23505") {
        setErr("Ya existe una cotización para ese par en esa fecha. Elegí otro día.");
      } else {
        setErr(error.message);
      }
      return;
    }
    closeModals();
    resetFormDefaults();
    void load();
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !editingId) return;
    setErr(null);
    const from = currencyFrom.trim().toUpperCase();
    const to = currencyTo.trim().toUpperCase();
    if (from === to) {
      setErr("Elegí dos monedas distintas.");
      return;
    }
    const buy = Number(String(quoteBuy).replace(",", "."));
    const sell = Number(String(quoteSell).replace(",", "."));
    if (!Number.isFinite(buy) || buy <= 0 || !Number.isFinite(sell) || sell <= 0) {
      setErr("Ingresá valores numéricos positivos en compra y venta.");
      return;
    }
    const iso = combineLocalDateTime(String(effectiveAt).trim(), "00:00");
    if (!iso) {
      setErr("Elegí una fecha de vigencia válida.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("ExchangeRate")
      .update({
        currency_from: from,
        currency_to: to,
        effective_at: iso,
        quote_buy: buy,
        quote_sell: sell,
        use_variant: useVariant,
      })
      .eq("id", editingId)
      .eq("organization_id", orgId);
    setSaving(false);
    if (error) {
      if (error.message.includes("duplicate") || error.code === "23505") {
        setErr("Ya existe una cotización para ese par en esa fecha.");
      } else {
        setErr(error.message);
      }
      return;
    }
    closeModals();
    resetFormDefaults();
    void load();
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar esta cotización?")) return;
    setErr(null);
    const { error } = await supabase.from("ExchangeRate").delete().eq("id", id);
    if (error) setErr(error.message);
    else void load();
  }

  const unitHint =
    currencyFrom.trim().toUpperCase() !== currencyTo.trim().toUpperCase()
      ? `${currencyTo.trim().toUpperCase()} por 1 ${currencyFrom.trim().toUpperCase()}`
      : "";

  const formBody = (
    <>
      <div>
        <Label htmlFor="fx-m-effective">Vigente desde</Label>
        <Input
          id="fx-m-effective"
          type="date"
          className="mt-1"
          value={effectiveAt}
          onChange={(e) => setEffectiveAt(e.target.value)}
          required
        />
      </div>
      <p className="text-sm text-[var(--muted)]">
        Par <strong>base → cotizada</strong>. <strong>Utilizar</strong> define si en reportes se toma el valor de compra, venta o el promedio
        cuando esta fila es la vigente según la fecha del precio. El importe mostrado se calcula automáticamente.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="fx-m-from">Moneda base</Label>
          <select
            id="fx-m-from"
            className={selectClass}
            value={currencyFrom}
            onChange={(e) => {
              const next = e.target.value;
              setCurrencyFrom(next);
              if (next === currencyTo) {
                const alt = currencyOptions.find((c) => c.code !== next);
                if (alt) setCurrencyTo(alt.code);
              }
            }}
          >
            {currencyOptions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="fx-m-to">Moneda cotizada</Label>
          <select id="fx-m-to" className={selectClass} value={currencyTo} onChange={(e) => setCurrencyTo(e.target.value)}>
            {currencyOptions
              .filter((c) => c.code !== currencyFrom)
              .map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.label}
                </option>
              ))}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="fx-m-buy">Compra</Label>
          <Input
            id="fx-m-buy"
            inputMode="decimal"
            value={quoteBuy}
            onChange={(e) => setQuoteBuy(e.target.value)}
            placeholder={currencyFrom === "USD" && currencyTo === "ARS" ? "ej. 1180" : "ej. 1.07"}
            required
            autoComplete="off"
          />
        </div>
        <div>
          <Label htmlFor="fx-m-sell">Venta</Label>
          <Input
            id="fx-m-sell"
            inputMode="decimal"
            value={quoteSell}
            onChange={(e) => setQuoteSell(e.target.value)}
            placeholder={currencyFrom === "USD" && currencyTo === "ARS" ? "ej. 1200" : "ej. 1.09"}
            required
            autoComplete="off"
          />
        </div>
      </div>
      {unitHint ? <p className="text-[0.65rem] text-[var(--muted)]">Unidad: {unitHint}</p> : null}

      <div>
        <span className="text-sm font-medium text-[var(--foreground)]">Utilizar</span>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {(["BUY", "SELL", "MID"] as const).map((v) => (
            <label
              key={v}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 py-2 text-sm"
            >
              <input
                type="radio"
                name="fx-use-variant"
                className="accent-[var(--accent)]"
                checked={useVariant === v}
                onChange={() => setUseVariant(v)}
              />
              {EXCHANGE_USE_LABELS[v]}
            </label>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="fx-m-importe">Importe a utilizar</Label>
        <Input
          id="fx-m-importe"
          readOnly
          disabled
          className="mt-1 bg-[var(--card)]/80 font-mono text-[var(--foreground)]"
          value={Number.isFinite(importeUtilizarPreview) ? fmtImporte(importeUtilizarPreview) : ""}
          placeholder="—"
        />
        <p className="mt-1 text-[0.65rem] text-[var(--muted)]">Solo lectura: corresponde a la opción Utilizar y a compra/venta.</p>
      </div>
    </>
  );

  return (
    <section id="exchange-rates" className="scroll-mt-6 space-y-4 rounded-xl border border-[var(--jif-line)] bg-[var(--card)] p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="jif-caps jif-dim" style={{ fontSize: "0.65rem" }}>
            Cotizaciones
          </p>
          <h3 className="mt-2 text-lg font-semibold">Cotizaciones</h3>
          <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
            Cargá pares con <strong>compra</strong> y <strong>venta</strong> y definí <strong>Utilizar</strong> (compra, venta o promedio). En
            reportes, para cada precio se aplica la cotización <strong>vigente a esa fecha</strong> y el importe según lo definido en esa fila.
          </p>
        </div>
        <Button type="button" className="jif-btn-primary" onClick={() => openCreate()} disabled={!orgId}>
          Nueva cotización
        </Button>
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <Modal
        open={createOpen}
        title="Nueva cotización"
        panelClassName="max-w-lg"
        onClose={() => {
          if (saving) return;
          setCreateOpen(false);
          resetFormDefaults();
        }}
        footer={
          <>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => (setCreateOpen(false), resetFormDefaults())}>
              Cancelar
            </Button>
            <Button type="submit" form="exchange-rate-create-form" disabled={!orgId || saving} className="jif-btn-primary">
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </>
        }
      >
        <form id="exchange-rate-create-form" onSubmit={(e) => void submitCreate(e)} className="space-y-4">
          {formBody}
        </form>
      </Modal>

      <Modal
        open={editOpen}
        title="Editar cotización"
        panelClassName="max-w-lg"
        onClose={() => {
          if (saving) return;
          setEditOpen(false);
          resetFormDefaults();
        }}
        footer={
          <>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => (setEditOpen(false), resetFormDefaults())}>
              Cancelar
            </Button>
            <Button type="submit" form="exchange-rate-edit-form" disabled={!orgId || saving} className="jif-btn-primary">
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </>
        }
      >
        <form id="exchange-rate-edit-form" onSubmit={(e) => void submitEdit(e)} className="space-y-4">
          {formBody}
        </form>
      </Modal>

      <div className="mt-6">
        <p className="jif-caps jif-dim mb-3" style={{ fontSize: "0.65rem" }}>
          Historial (más reciente arriba, agrupado por moneda)
        </p>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="min-w-[11rem]">
            <Label htmlFor="fx-filter-de">Moneda</Label>
            <select
              id="fx-filter-de"
              className={selectClass}
              value={filterDe}
              onChange={(e) => setFilterDe(e.target.value)}
            >
              <option value="">Todas</option>
              {distinctCurrencyFrom.map((c) => {
                const lab = currencyOptions.find((x) => x.code === c)?.label ?? c;
                return (
                  <option key={c} value={c}>
                    {c} — {lab}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <Label htmlFor="fx-filter-from">Desde</Label>
            <Input
              id="fx-filter-from"
              type="date"
              className="mt-1"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="fx-filter-to">Hasta</Label>
            <Input
              id="fx-filter-to"
              type="date"
              className="mt-1"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
            />
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Cargando…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-[var(--jif-line)] px-4 py-8 text-center text-sm text-[var(--muted)]">
            Sin cotizaciones cargadas.
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-xl border border-[var(--jif-line)] px-4 py-8 text-center text-sm text-[var(--muted)]">
            Ninguna cotización coincide con los filtros.
          </div>
        ) : (
          <div className="space-y-8">
            {groupedByFrom.map(([fromCode, groupRows]) => {
              const currencyLabel = currencyOptions.find((c) => c.code === fromCode)?.label ?? fromCode;
              return (
              <div key={fromCode}>
                <p className="mb-2 text-sm text-[var(--foreground)]">
                  <span className="font-mono tracking-tight text-[var(--muted)]">{fromCode}</span>
                  <span className="mx-1.5 text-[var(--muted)]">—</span>
                  <strong className="font-semibold text-[var(--foreground)]">{currencyLabel}</strong>
                </p>
                <div className="overflow-x-auto rounded-xl border border-[var(--jif-line)]">
                  <table className="jif-table w-full min-w-[58rem] table-fixed border-collapse text-left text-sm">
                    <colgroup>
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "7%" }} />
                      <col style={{ width: "7%" }} />
                      <col style={{ width: "11%" }} />
                      <col style={{ width: "11%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "12%" }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-[var(--jif-line)]">
                        <th
                          scope="col"
                          className="whitespace-nowrap px-3 py-3 pl-4 text-left text-[0.65rem] font-medium uppercase tracking-wide text-[var(--muted)] sm:pl-5"
                        >
                          Vigente desde
                        </th>
                        <th
                          scope="col"
                          className="whitespace-nowrap px-3 py-3 text-left text-[0.65rem] font-medium uppercase tracking-wide text-[var(--muted)]"
                        >
                          De
                        </th>
                        <th
                          scope="col"
                          className="whitespace-nowrap px-3 py-3 text-left text-[0.65rem] font-medium uppercase tracking-wide text-[var(--muted)]"
                        >
                          A
                        </th>
                        <th
                          scope="col"
                          className="whitespace-nowrap px-3 py-3 text-right text-[0.65rem] font-medium uppercase tracking-wide text-[var(--muted)]"
                        >
                          Compra
                        </th>
                        <th
                          scope="col"
                          className="whitespace-nowrap px-3 py-3 text-right text-[0.65rem] font-medium uppercase tracking-wide text-[var(--muted)]"
                        >
                          Venta
                        </th>
                        <th
                          scope="col"
                          className="whitespace-normal px-3 py-3 text-left text-[0.65rem] font-medium uppercase tracking-wide text-[var(--muted)]"
                        >
                          Utilizar
                        </th>
                        <th
                          scope="col"
                          className="whitespace-normal px-3 py-3 text-right text-[0.65rem] font-medium uppercase tracking-wide text-[var(--muted)]"
                        >
                          Importe utilizado
                        </th>
                        <th scope="col" className="whitespace-nowrap px-3 py-3 pr-4 text-right sm:pr-5" aria-label="Acciones" />
                      </tr>
                    </thead>
                    <tbody>
                      {groupRows.map((r) => {
                        const eff = effectiveQuoteForUse(r);
                        const uv = parseUseVariant(r.use_variant);
                        return (
                          <tr key={r.id} className="border-b border-[var(--jif-line)]/60">
                            <td className="whitespace-nowrap px-3 py-3 pl-4 text-[var(--foreground)] sm:pl-5">
                              {new Date(r.effective_at).toLocaleDateString("es-AR")}
                            </td>
                            <td className="px-3 py-3 font-mono text-xs text-[var(--muted)]">{r.currency_from}</td>
                            <td className="px-3 py-3 font-mono text-xs text-[var(--muted)]">{r.currency_to}</td>
                            <td className="px-3 py-3 text-right font-mono text-xs tabular-nums text-[var(--foreground)] md:text-sm">
                              {fmtImporte(Number(r.quote_buy))}
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-xs tabular-nums text-[var(--foreground)] md:text-sm">
                              {fmtImporte(Number(r.quote_sell))}
                            </td>
                            <td className="px-3 py-3 text-[var(--foreground)]">{EXCHANGE_USE_LABELS[uv]}</td>
                            <td className="px-3 py-3 text-right font-mono text-xs font-medium tabular-nums text-[var(--foreground)] md:text-sm">
                              {fmtImporte(eff)}
                            </td>
                            <td className="px-3 py-3 pr-4 text-right sm:pr-5">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  className="rounded-md p-2 text-[var(--accent)] hover:bg-stone-900/5"
                                  title="Editar cotización"
                                  aria-label="Editar cotización"
                                  onClick={() => openEdit(r)}
                                >
                                  <Pencil className="size-4" strokeWidth={1.75} />
                                </button>
                                <button
                                  type="button"
                                  className="rounded-md p-2 text-red-700 hover:bg-red-50"
                                  title="Eliminar cotización"
                                  aria-label="Eliminar cotización"
                                  onClick={() => void remove(r.id)}
                                >
                                  <Trash2 className="size-4" strokeWidth={1.75} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
            })}
          </div>
        )}
      </div>

      <p className="mt-6 text-xs text-[var(--muted)]">
        Los reportes convierten moneda usando, para cada fecha de precio, la fila de cotización vigente y el <strong>Importe utilizado</strong>{" "}
        según <strong>Utilizar</strong> en esa fila. El cálculo sigue la vigencia por <strong>fecha efectiva</strong> del dato.
      </p>
    </section>
  );
}

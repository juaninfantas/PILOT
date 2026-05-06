import { useCallback, useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useActiveOrganization } from "../../contexts/OrganizationContext";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Modal } from "../../components/ui/modal";
import { cn } from "../../lib/utils";
import type { Database } from "../../types/database";
import type { PropertyShareVisibility } from "../../lib/property-share-visibility";

type FormatRow = Database["public"]["Tables"]["PropertyShareFormat"]["Row"];
type FlagKey = keyof PropertyShareVisibility;

type FlagItem = { key: FlagKey; label: string };

function sortByLabel(a: FlagItem, b: FlagItem) {
  return a.label.localeCompare(b.label, "es", { sensitivity: "base" });
}

const membreteFlags: FlagItem[] = [
  { key: "show_org_fiscal_address", label: "Domicilio fiscal (membrete)" },
  { key: "show_org_logo", label: "Logo inmobiliaria" },
  { key: "show_org_name", label: "Nombre inmobiliaria" },
  { key: "show_org_contact", label: "Teléfono y matrícula" },
];
membreteFlags.sort(sortByLabel);

const ubicacionFlags: FlagItem[] = [
  { key: "show_city_zone", label: "Ciudad / zona (texto libre)" },
  { key: "show_coordinates", label: "Coordenadas (lat / lng)" },
  { key: "show_external_map_link", label: "Enlace a mapa externo (Google)" },
  { key: "show_geo_path", label: "Ubicación maestro (país › … con etiquetas)" },
  { key: "show_property_title", label: "Título de la propiedad" },
  { key: "show_street_address", label: "Dirección de calle" },
];
ubicacionFlags.sort(sortByLabel);

const comercialFlags: FlagItem[] = [
  { key: "show_spec_amenities", label: "Características" },
  { key: "show_spec_bathrooms", label: "Cantidad de baños" },
  { key: "show_spec_covered_m2", label: "Superficie cubierta" },
  { key: "show_spec_condition", label: "Estado / condición del inmueble" },
  { key: "show_spec_exclusive", label: "Exclusiva" },
  { key: "show_spec_kind", label: "Tipo de propiedad" },
  { key: "show_spec_listing_status", label: "Estado comercial (publicación)" },
  { key: "show_spec_parking", label: "Estacionamiento" },
  { key: "show_spec_rooms", label: "Ambientes" },
  { key: "show_spec_total_m2", label: "Superficie total" },
  { key: "show_price", label: "Precio público" },
];
comercialFlags.sort(sortByLabel);

const contenidoFlags: FlagItem[] = [
  { key: "show_description", label: "Descripción" },
  { key: "show_photos", label: "Fotos" },
];
contenidoFlags.sort(sortByLabel);

/** Secciones: items ya ordenados alfabéticamente por etiqueta. */
const SHARE_FORMAT_SECTIONS: { id: string; title: string; subtitle?: string; items: FlagItem[] }[] = [
  {
    id: "membrete",
    title: "Membrete e inmobiliaria",
    subtitle: "Qué tan formal es el encabezado del documento (logo, datos fiscales, contacto profesional).",
    items: membreteFlags,
  },
  {
    id: "ubicacion",
    title: "Ubicación de la propiedad",
    items: ubicacionFlags,
  },
  {
    id: "comercial",
    title: "Ficha comercial",
    items: comercialFlags,
  },
  {
    id: "contenido",
    title: "Contenido",
    items: contenidoFlags,
  },
];

const ALL_FLAG_KEYS: FlagKey[] = SHARE_FORMAT_SECTIONS.flatMap((s) => s.items.map((i) => i.key));

type DraftState = {
  name: string;
} & Record<FlagKey, boolean>;

function defaultDraft(): DraftState {
  return {
    name: "Nuevo formato",
    show_org_logo: true,
    show_org_name: true,
    show_org_fiscal_address: true,
    show_org_contact: true,
    show_property_title: true,
    show_city_zone: true,
    show_street_address: true,
    show_price: true,
    show_spec_kind: true,
    show_spec_listing_status: true,
    show_spec_exclusive: true,
    show_spec_covered_m2: true,
    show_spec_total_m2: true,
    show_spec_rooms: true,
    show_spec_bathrooms: true,
    show_spec_parking: true,
    show_spec_condition: true,
    show_spec_amenities: true,
    show_description: true,
    show_photos: true,
    show_geo_path: true,
    show_coordinates: false,
    show_external_map_link: false,
  };
}

function rowToDraft(row: FormatRow): DraftState {
  return {
    name: row.name,
    show_org_logo: row.show_org_logo,
    show_org_name: row.show_org_name,
    show_org_fiscal_address: row.show_org_fiscal_address,
    show_org_contact: row.show_org_contact,
    show_property_title: row.show_property_title,
    show_city_zone: row.show_city_zone,
    show_street_address: row.show_street_address,
    show_price: row.show_price,
    show_spec_kind: row.show_spec_kind,
    show_spec_listing_status: row.show_spec_listing_status,
    show_spec_exclusive: row.show_spec_exclusive,
    show_spec_covered_m2: row.show_spec_covered_m2,
    show_spec_total_m2: row.show_spec_total_m2,
    show_spec_rooms: row.show_spec_rooms,
    show_spec_bathrooms: row.show_spec_bathrooms,
    show_spec_parking: row.show_spec_parking,
    show_spec_condition: row.show_spec_condition,
    show_spec_amenities: row.show_spec_amenities,
    show_description: row.show_description,
    show_photos: row.show_photos,
    show_geo_path: row.show_geo_path,
    show_coordinates: row.show_coordinates,
    show_external_map_link: row.show_external_map_link,
  };
}

function draftHasAnyVisible(d: DraftState): boolean {
  return ALL_FLAG_KEYS.some((k) => d[k]);
}

function ShareFormatFlagChips({
  items,
  draft,
  onToggle,
}: {
  items: FlagItem[];
  draft: DraftState;
  onToggle: (key: FlagKey) => void;
}) {
  const visible = useMemo(() => items.filter((i) => draft[i.key]).sort(sortByLabel), [items, draft]);
  const hidden = useMemo(() => items.filter((i) => !draft[i.key]).sort(sortByLabel), [items, draft]);

  const chipClass = (on: boolean) =>
    cn(
      "rounded-full border px-3 py-1.5 text-xs transition-colors",
      on
        ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--foreground)]"
        : "border-[var(--border)] bg-[#fffcf7] text-[var(--muted)] hover:border-[var(--accent)]/40",
    );

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Visibles en ficha / PDF / enlace</p>
        <div className="mt-2 flex min-h-[2.25rem] flex-wrap gap-2">
          {visible.length === 0 ? (
            <span className="text-xs italic text-[var(--muted)]">Ninguno en esta sección</span>
          ) : (
            visible.map((i) => (
              <button key={i.key} type="button" className={chipClass(true)} onClick={() => onToggle(i.key)}>
                {i.label}
              </button>
            ))
          )}
        </div>
      </div>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Ocultos</p>
        <div className="mt-2 flex min-h-[2.25rem] flex-wrap gap-2">
          {hidden.length === 0 ? (
            <span className="text-xs italic text-[var(--muted)]">Todos visibles</span>
          ) : (
            hidden.map((i) => (
              <button key={i.key} type="button" className={chipClass(false)} onClick={() => onToggle(i.key)}>
                {i.label}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function PropertyShareFormatsSection() {
  const org = useActiveOrganization();
  const [rows, setRows] = useState<FormatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FormatRow | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyDefaultId, setBusyDefaultId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" })),
    [rows],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("PropertyShareFormat")
      .select("*")
      .eq("organization_id", org.id)
      .order("name", { ascending: true });
    if (error) setErr(error.message);
    else setRows((data as FormatRow[]) ?? []);
    setLoading(false);
  }, [org.id]);

  useEffect(() => {
    void load();
  }, [load]);

  function openNew() {
    setEditing(null);
    setDraft(defaultDraft());
    setErr(null);
    setModalOpen(true);
  }

  function openEdit(row: FormatRow) {
    setEditing(row);
    setDraft(rowToDraft(row));
    setErr(null);
    setModalOpen(true);
  }

  function toggleFlag(key: FlagKey) {
    setDraft((d) => (d ? { ...d, [key]: !d[key] } : d));
  }

  async function saveModal() {
    if (!draft?.name.trim()) {
      setErr("Nombre obligatorio.");
      return;
    }
    if (!draftHasAnyVisible(draft)) {
      setErr("Activá al menos un campo visible en total.");
      return;
    }
    setSaving(true);
    setErr(null);
    const payload = {
      name: draft.name.trim(),
      show_org_logo: draft.show_org_logo,
      show_org_name: draft.show_org_name,
      show_org_fiscal_address: draft.show_org_fiscal_address,
      show_org_contact: draft.show_org_contact,
      show_property_title: draft.show_property_title,
      show_city_zone: draft.show_city_zone,
      show_street_address: draft.show_street_address,
      show_price: draft.show_price,
      show_spec_kind: draft.show_spec_kind,
      show_spec_listing_status: draft.show_spec_listing_status,
      show_spec_exclusive: draft.show_spec_exclusive,
      show_spec_covered_m2: draft.show_spec_covered_m2,
      show_spec_total_m2: draft.show_spec_total_m2,
      show_spec_rooms: draft.show_spec_rooms,
      show_spec_bathrooms: draft.show_spec_bathrooms,
      show_spec_parking: draft.show_spec_parking,
      show_spec_condition: draft.show_spec_condition,
      show_spec_amenities: draft.show_spec_amenities,
      show_description: draft.show_description,
      show_photos: draft.show_photos,
      show_geo_path: draft.show_geo_path,
      show_coordinates: draft.show_coordinates,
      show_external_map_link: draft.show_external_map_link,
    };
    const { error } = editing
      ? await supabase.from("PropertyShareFormat").update(payload).eq("id", editing.id).eq("organization_id", org.id)
      : await supabase.from("PropertyShareFormat").insert({ organization_id: org.id, ...payload });
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setModalOpen(false);
    void load();
  }

  async function setAsDefaultShare(row: FormatRow) {
    if (row.is_default_share) return;
    setBusyDefaultId(row.id);
    setErr(null);
    const { error } = await supabase
      .from("PropertyShareFormat")
      .update({ is_default_share: true })
      .eq("id", row.id)
      .eq("organization_id", org.id);
    setBusyDefaultId(null);
    if (error) setErr(error.message);
    else void load();
  }

  async function removeRow(row: FormatRow) {
    if (rows.length <= 1) {
      setErr("Tiene que existir al menos un formato.");
      return;
    }
    if (!window.confirm(`¿Eliminar el formato «${row.name}»? Los enlaces ya creados quedan sin plantilla asociada.`)) return;
    const { error } = await supabase.from("PropertyShareFormat").delete().eq("id", row.id).eq("organization_id", org.id);
    if (error) setErr(error.message);
    else void load();
  }

  return (
    <section id="share-formats" className="scroll-mt-6 rounded-xl border border-[var(--jif-line)] bg-[var(--card)] p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Formatos de compartir</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            Definí qué campos se muestran en el enlace público, el PDF y el texto copiable. Los formatos se listan en orden
            alfabético por nombre. Marcá con la estrella cuál se abre por defecto en el modal de compartir (si no, se usa «Completa» o
            el primero alfabéticamente).
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => openNew()}>
          Nuevo formato
        </Button>
      </div>

      {err && !modalOpen ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
      {loading ? (
        <p className="mt-4 text-sm text-[var(--muted)]">Cargando…</p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--border)] border border-[var(--border)] rounded-lg bg-[#fffcf7]">
          {sortedRows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <button
                  type="button"
                  title={r.is_default_share ? "Predeterminado al compartir" : "Usar como predeterminado al compartir"}
                  aria-label={r.is_default_share ? "Formato predeterminado" : "Marcar como predeterminado al compartir"}
                  aria-pressed={r.is_default_share}
                  disabled={Boolean(busyDefaultId) || r.is_default_share}
                  className={cn(
                    "shrink-0 rounded-md p-1.5 transition-colors disabled:opacity-50",
                    r.is_default_share
                      ? "text-amber-600"
                      : "text-[var(--muted)] hover:bg-[var(--accent)]/10 hover:text-amber-700",
                  )}
                  onClick={() => void setAsDefaultShare(r)}
                >
                  <Star className={cn("size-4", r.is_default_share && "fill-current")} />
                </button>
                <span className="min-w-0 truncate font-medium">{r.name}</span>
                {r.is_default_share ? (
                  <span className="hidden shrink-0 text-[10px] font-medium uppercase tracking-wide text-amber-800 sm:inline">
                    Predeterminado
                  </span>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button type="button" className="text-[var(--accent)] hover:underline" onClick={() => openEdit(r)}>
                  Editar
                </button>
                <button type="button" className="text-red-600 hover:underline" onClick={() => void removeRow(r)}>
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={modalOpen}
        title={editing ? "Editar formato" : "Nuevo formato"}
        onClose={() => {
          setModalOpen(false);
          setErr(null);
        }}
        panelClassName="max-w-2xl max-h-[min(90vh,720px)] overflow-y-auto"
      >
        {draft ? (
          <div className="space-y-6">
            <div>
              <Label htmlFor="sf-name">Nombre</Label>
              <Input
                id="sf-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-[var(--muted)]">Los formatos se ordenan alfabéticamente por este nombre.</p>
            </div>

            <div className="space-y-6 border-t border-[var(--border)] pt-4">
              {SHARE_FORMAT_SECTIONS.map((sec) => (
                <div key={sec.id} className="space-y-2">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">{sec.title}</h3>
                  {sec.subtitle ? <p className="text-xs text-[var(--muted)]">{sec.subtitle}</p> : null}
                  <ShareFormatFlagChips items={sec.items} draft={draft} onToggle={toggleFlag} />
                </div>
              ))}
            </div>

            {err ? <p className="text-sm text-red-600">{err}</p> : null}
            <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-3">
              <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" disabled={saving} onClick={() => void saveModal()}>
                {saving ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}

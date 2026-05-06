import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Archive,
  ArrowUpRight,
  ChevronLeft,
  ExternalLink,
  ImageUp,
  Loader2,
  Menu,
  Share2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useActiveOrganization } from "../../contexts/OrganizationContext";
import { useAuth } from "../../contexts/AuthContext";
import { hasPermission } from "../../lib/permissions";
import { RequirePermission } from "../../components/RequirePermission";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { PhotoLightbox } from "../../components/ui/photo-lightbox";
import { Modal } from "../../components/ui/modal";
import { PropertyDetailEditForm } from "./PropertyDetailEditForm";
import { CurrencySelect } from "../../components/ui/currency-select";
import { geocodeAddress } from "../../lib/geocode";
import { PRICE_KIND_LABEL } from "../../lib/crm-labels";
import { normalizeCurrencyCode } from "../../lib/currencies";
import { combineLocalDateTime, isoToDateAndTime, todayDateInputValue } from "../../lib/datetime-form";
import { managementCodesFromForm, serializeManagement } from "../../lib/property-management";
import { TIME_OPTIONS } from "../../lib/time-options";
import type { AppraisalSource, Database, ListingStatus, PropertyKind } from "../../types/database";

const EXTERNAL_APPRAISER_OTHER = "__OTHER__";

function looksLikeImageFilename(name: string): boolean {
  return /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp|tiff?)$/i.test(name.trim());
}

function isRecognizedImageFile(f: File): boolean {
  if (f.type.startsWith("image/")) return true;
  if (!f.type && looksLikeImageFilename(f.name)) return true;
  return false;
}
import { PropertyShareModal } from "../../components/properties/PropertyShareModal";
import type { PublicPropertyPdfInput } from "../../lib/property-public-pdf";
import { useMdUp } from "../../hooks/useMediaQuery";

type Property = Database["public"]["Tables"]["Property"]["Row"];
type PriceRow = Database["public"]["Tables"]["PropertyPrice"]["Row"];
type AppraisalRow = Database["public"]["Tables"]["PropertyAppraisal"]["Row"];
type FileRow = Database["public"]["Tables"]["PropertyFile"]["Row"];

/** % de tabla alineadas entre Histórico de precios y Tasaciones (fecha, importe, acciones iguales; tipo = origen+tasador). */
const PRICE_APPRAISAL_TBL = {
  fecha: 13,
  importe: 20,
  origen: 13,
  tasador: 36,
  acciones: 18,
} as const;

const priceTipoColPct =
  PRICE_APPRAISAL_TBL.origen + PRICE_APPRAISAL_TBL.tasador /** 49%; ancho combinado origen+tasador en tasaciones */;

const priceTipoColPctSinAcciones = 100 - PRICE_APPRAISAL_TBL.fecha - PRICE_APPRAISAL_TBL.importe;

const appraisalTasadorColPctSinAcciones = PRICE_APPRAISAL_TBL.tasador + PRICE_APPRAISAL_TBL.acciones;

function CollapsibleCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{title}</span>
          <span className="shrink-0 text-xs text-[var(--muted)] group-open:hidden">Abrir</span>
          <span className="hidden shrink-0 text-xs text-[var(--muted)] group-open:inline">Cerrar</span>
        </div>
        {subtitle ? <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p> : null}
      </summary>
      <div className="border-t border-[var(--border)] p-4">{children}</div>
    </details>
  );
}

export function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const nav = useNavigate();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const { user, permissions } = useAuth();
  const fallbackOrg = useActiveOrganization();
  const canEdit = hasPermission(permissions, "manage_properties");
  const [property, setProperty] = useState<Property | null>(null);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [appraisals, setAppraisals] = useState<AppraisalRow[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editTab, setEditTab] = useState("general");
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [editingPrice, setEditingPrice] = useState<PriceRow | null>(null);
  const [appraisalModalOpen, setAppraisalModalOpen] = useState(false);
  const [editingAppraisal, setEditingAppraisal] = useState<AppraisalRow | null>(null);
  const [tasacionModalSource, setTasacionModalSource] = useState<AppraisalSource>("OWN");
  /** Person id cuando es tasador CRM, EXTERNAL_APPRAISER_OTHER para nombre libre, "" ninguno. */
  const [tasacionModalAppraiserKey, setTasacionModalAppraiserKey] = useState<string>("");
  const [photoUploadBusy, setPhotoUploadBusy] = useState(false);
  const [docUploadBusy, setDocUploadBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState<"photos" | "docs" | null>(null);
  const [mainSaving, setMainSaving] = useState(false);
  const [geoPathLabeled, setGeoPathLabeled] = useState<string | null>(null);
  const [priceSaving, setPriceSaving] = useState(false);
  const [appraisalSaving, setAppraisalSaving] = useState(false);
  /** Remount del formulario tras guardar para alinear defaultValues con el servidor. */
  const [editFormKey, setEditFormKey] = useState(0);
  const mdUp = useMdUp();
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [photoLbIndex, setPhotoLbIndex] = useState<number | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  /** source_offer_id (Oferta) → oportunidad para mostrar título y enlace en histórico de precios. */
  const [offerOppBySourceId, setOfferOppBySourceId] = useState<
    Record<string, { oppId: string; title: string }>
  >({});

  async function refreshPrices() {
    if (!id) return;
    const { data: pr } = await supabase
      .from("PropertyPrice")
      .select("*")
      .eq("property_id", id)
      .order("effective_at", { ascending: false });
    setPrices((pr as PriceRow[]) ?? []);
  }

  async function refreshAppraisals() {
    if (!id) return;
    const { data: ap } = await supabase
      .from("PropertyAppraisal")
      .select("*")
      .eq("property_id", id)
      .order("appraised_at", { ascending: false });
    setAppraisals((ap as AppraisalRow[]) ?? []);
  }

  async function refreshFiles() {
    if (!id) return;
    const { data: f } = await supabase.from("PropertyFile").select("*").eq("property_id", id);
    setFiles((f as FileRow[]) ?? []);
  }

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [propRes, prRes, apRes, fRes, plistRes] = await Promise.all([
        supabase.from("Property").select("*").eq("id", id).maybeSingle(),
        supabase.from("PropertyPrice").select("*").eq("property_id", id).order("effective_at", { ascending: false }),
        supabase.from("PropertyAppraisal").select("*").eq("property_id", id).order("appraised_at", { ascending: false }),
        supabase.from("PropertyFile").select("*").eq("property_id", id),
        supabase.from("Person").select("id, name").order("name"),
      ]);
      if (propRes.error) setError(propRes.error.message);
      else setProperty(propRes.data as Property);
      setPrices((prRes.data as PriceRow[]) ?? []);
      setAppraisals((apRes.data as AppraisalRow[]) ?? []);
      setFiles((fRes.data as FileRow[]) ?? []);
      setPeople((plistRes.data as { id: string; name: string }[]) ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setEditFormKey(0);
    void load();
  }, [id, canEdit]);

  useLayoutEffect(() => {
    if (location.hash !== "#fotos-galeria") return;
    requestAnimationFrame(() => {
      document.getElementById("fotos-galeria")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [location.hash, location.pathname, id]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (mdUp || !mobileMoreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mdUp, mobileMoreOpen]);

  useEffect(() => {
    if (mdUp) setMobileMoreOpen(false);
  }, [mdUp]);

  useEffect(() => {
    const n = files.filter((f) => f.kind === "photo" || f.kind === "cover").length;
    if (n === 0) setPhotoLbIndex(null);
  }, [files]);

  useEffect(() => {
    const offerIds = [
      ...new Set(
        prices
          .filter((p) => p.kind === "OFFER_OPPORTUNITY" && p.source_offer_id)
          .map((p) => p.source_offer_id as string),
      ),
    ];
    if (offerIds.length === 0) {
      setOfferOppBySourceId({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data: offers, error } = await supabase
        .from("OpportunityPropertyOffer")
        .select("id, opportunity_id")
        .in("id", offerIds);
      if (cancelled) return;
      if (error || !offers?.length) {
        setOfferOppBySourceId({});
        return;
      }
      const oppIds = [...new Set(offers.map((o) => o.opportunity_id))];
      const { data: opps } = await supabase.from("Opportunity").select("id, title").in("id", oppIds);
      if (cancelled) return;
      const titleByOpp = Object.fromEntries((opps ?? []).map((o) => [o.id, o.title]));
      const next: Record<string, { oppId: string; title: string }> = {};
      for (const row of offers) {
        next[row.id] = {
          oppId: row.opportunity_id,
          title: titleByOpp[row.opportunity_id]?.trim() || "Sin título",
        };
      }
      setOfferOppBySourceId(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [prices]);

  useEffect(() => {
    if (!appraisalModalOpen) return;
    const row = editingAppraisal;
    if (!row) {
      setTasacionModalSource("OWN");
      setTasacionModalAppraiserKey("");
      return;
    }
    const src = row.source ?? "OWN";
    setTasacionModalSource(src);
    if (src !== "EXTERNAL") {
      setTasacionModalAppraiserKey("");
      return;
    }
    const hasFreeName = !!(row.appraiser_name?.trim() && !row.appraiser_id);
    if (hasFreeName) {
      setTasacionModalAppraiserKey(EXTERNAL_APPRAISER_OTHER);
    } else {
      setTasacionModalAppraiserKey(row.appraiser_id ?? "");
    }
  }, [appraisalModalOpen, editingAppraisal?.id]);

  useEffect(() => {
    if (!property?.geo_unit_id) {
      setGeoPathLabeled(null);
      return;
    }
    let cancelled = false;
    void supabase.rpc("geo_unit_path_labeled", { p_unit_id: property.geo_unit_id, p_locale: "es" }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setGeoPathLabeled(null);
        return;
      }
      setGeoPathLabeled(typeof data === "string" ? data : null);
    });
    return () => {
      cancelled = true;
    };
  }, [property?.geo_unit_id]);

  async function onUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!id || !property || mainSaving) return;
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "").trim();
    const city_zone = String(fd.get("city_zone") ?? "").trim();
    if (!title || !city_zone) {
      setError("Título y localidad obligatorios");
      return;
    }
    const kind = String(fd.get("kind") ?? "OTHER") as PropertyKind;
    const listing_status = String(fd.get("listing_status") ?? "AVAILABLE") as ListingStatus;
    let lat = fd.get("lat") ? Number(fd.get("lat")) : null;
    let lng = fd.get("lng") ? Number(fd.get("lng")) : null;
    const address = String(fd.get("address") ?? "").trim() || null;
    const postal_code = String(fd.get("postal_code") ?? "").trim() || null;
    const geoRaw = String(fd.get("geo_unit_id") ?? "").trim();
    const geo_unit_id = geoRaw ? geoRaw : null;
    if (lat == null || Number.isNaN(lat) || lng == null || Number.isNaN(lng)) {
      let geoLine: string | null = null;
      if (geo_unit_id) {
        const { data } = await supabase.rpc("geo_unit_path_line", { p_unit_id: geo_unit_id });
        geoLine = typeof data === "string" ? data : null;
      }
      const q = [address, postal_code, city_zone, geoLine].filter((x) => (x ?? "").trim()).join(", ");
      if (q.trim()) {
        const g = await geocodeAddress(q);
        if (g) {
          lat = g.lat;
          lng = g.lng;
        }
      }
    }
    setMainSaving(true);
    const { data: updatedRow, error: ue } = await supabase
      .from("Property")
      .update({
        title,
        city_zone,
        address,
        postal_code,
        geo_unit_id,
        kind,
        covered_m2: fd.get("covered_m2") ? Number(fd.get("covered_m2")) : null,
        total_m2: fd.get("total_m2") ? Number(fd.get("total_m2")) : null,
        rooms: fd.get("rooms") ? parseInt(String(fd.get("rooms")), 10) : null,
        bathrooms: fd.get("bathrooms") ? parseInt(String(fd.get("bathrooms")), 10) : null,
        parking: fd.get("parking") ? parseInt(String(fd.get("parking")), 10) : null,
        condition: String(fd.get("condition") ?? "").trim() || null,
        description: String(fd.get("description") ?? "").trim() || null,
        is_exclusive: fd.get("is_exclusive") === "on",
        management: serializeManagement(managementCodesFromForm(fd.getAll("management"))) || null,
        amenity_tags: String(fd.get("amenity_tags") ?? "").trim() || null,
        lat,
        lng,
        listing_status,
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    setMainSaving(false);
    if (ue) setError(ue.message);
    else {
      if (updatedRow) setProperty(updatedRow as Property);
      setMsg("Guardado.");
      setDirty(false);
      setEditFormKey((k) => k + 1);
    }
  }

  async function savePrice(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!id || !user?.id || priceSaving) return;
    if (editingPrice?.kind === "OFFER_OPPORTUNITY") {
      setError("Las ofertas sincronizadas se gestionan desde la oportunidad.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const amount = fd.get("amount");
    if (!amount) return;
    const kindRaw = String(fd.get("kind") ?? "LISTING_PUBLIC");
    const kind = (kindRaw === "LISTING_RESERVED" ? "LISTING_RESERVED" : "LISTING_PUBLIC") as "LISTING_PUBLIC" | "LISTING_RESERVED";
    const dateStr = String(fd.get("effective_date") ?? "").trim();
    const timeStr = String(fd.get("effective_time") ?? "09:00").trim();
    const effective_at =
      combineLocalDateTime(dateStr, timeStr) ??
      editingPrice?.effective_at ??
      new Date().toISOString();
    const currency = normalizeCurrencyCode(String(fd.get("currency") ?? "USD"));
    const payload = {
      property_id: id,
      amount: String(amount),
      currency,
      kind,
      effective_at,
      note: String(fd.get("note") ?? "").trim() || null,
      created_by_id: user.id,
    };
    setPriceSaving(true);
    const { error: e1 } = editingPrice
      ? await supabase.from("PropertyPrice").update(payload).eq("id", editingPrice.id)
      : await supabase.from("PropertyPrice").insert(payload);
    setPriceSaving(false);
    if (e1) {
      setError(e1.message);
      return;
    }
    await supabase.from("AuditLog").insert({
      organization_id: property?.organization_id ?? fallbackOrg.id,
      user_id: user.id,
      entity: "Property",
      entity_id: id,
      action: "PRICE_CHANGE",
      payload_json: JSON.stringify({
        amount: String(amount),
        currency,
        kind: fd.get("kind"),
      }),
    });
    setMsg(editingPrice ? "Precio actualizado." : "Precio agregado.");
    setPriceModalOpen(false);
    setEditingPrice(null);
    void refreshPrices();
  }

  async function saveAppraisal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!id || appraisalSaving) return;
    setError(null);
    const fd = new FormData(e.currentTarget);
    const amount = fd.get("amount");
    if (!amount) return;
    const dateStr = String(fd.get("appraised_date") ?? "").trim();
    /** Tasación sólo por día en UI; se persiste medianoche hora local. */
    const appraised_at =
      combineLocalDateTime(dateStr, "00:00") ??
      editingAppraisal?.appraised_at ??
      new Date().toISOString();
    const currency = normalizeCurrencyCode(String(fd.get("currency") ?? "USD"));

    let appraiser_id: string | null = null;
    let appraiser_name: string | null = null;
    if (tasacionModalSource === "EXTERNAL") {
      if (tasacionModalAppraiserKey === "") {
        setError("Seleccioná un tasador de la lista o «Otro».");
        return;
      }
      if (tasacionModalAppraiserKey === EXTERNAL_APPRAISER_OTHER) {
        appraiser_name = String(fd.get("appraiser_name") ?? "").trim() || null;
        if (!appraiser_name) {
          setError("Indicá el nombre del tasador.");
          return;
        }
      } else {
        appraiser_id = tasacionModalAppraiserKey;
      }
    }

    const payload = {
      property_id: id,
      amount: String(amount),
      currency,
      appraised_at,
      source: tasacionModalSource,
      appraiser_id,
      appraiser_name,
      reference_note: String(fd.get("reference_note") ?? "").trim() || null,
    };
    setAppraisalSaving(true);
    const { error: ae } = editingAppraisal
      ? await supabase.from("PropertyAppraisal").update(payload).eq("id", editingAppraisal.id)
      : await supabase.from("PropertyAppraisal").insert(payload);
    setAppraisalSaving(false);
    if (ae) setError(ae.message);
    else {
      setMsg(editingAppraisal ? "Tasación actualizada." : "Tasación agregada.");
      setAppraisalModalOpen(false);
      setEditingAppraisal(null);
      void refreshAppraisals();
    }
  }

  async function onUploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const files = input.files?.length ? Array.from(input.files) : [];
    input.value = "";
    if (!files.length || !id || !user?.id) return;
    if (files.some((f) => !isRecognizedImageFile(f))) {
      setError("Sólo imágenes (JPG, PNG, WebP, HEIC…).");
      return;
    }
    setPhotoUploadBusy(true);
    setMsg(null);
    setError(null);
    let ok = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const safeName = file.name.replace(/[^\w.-]+/g, "_");
        const path = `${user.id}/${id}/${Date.now()}-n${i}-${Math.random().toString(36).slice(2, 10)}-${safeName}`;
        const { error: upErr } = await supabase.storage.from("property-files").upload(path, file, { upsert: false });
        if (upErr) {
          setError(`No se pudo subir «${file.name}»: ${upErr.message}`);
          break;
        }
        const { data: pub } = supabase.storage.from("property-files").getPublicUrl(path);
        const { error: ie } = await supabase.from("PropertyFile").insert({
          property_id: id,
          url: pub.publicUrl,
          mime_type: file.type || null,
          kind: "photo",
          label: file.name,
        });
        if (ie) {
          setError(`«${file.name}»: ${ie.message}`);
          break;
        }
        ok += 1;
      }
      if (ok > 0) {
        setMsg(
          ok === files.length
            ? `Se cargaron ${ok} foto(s). Podés marcar portada en la galería.`
            : `Se cargaron ${ok} de ${files.length} foto(s).`,
        );
        void refreshFiles();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir fotos.");
    } finally {
      setPhotoUploadBusy(false);
    }
  }

  async function onUploadDocument(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const files = input.files?.length ? Array.from(input.files) : [];
    input.value = "";
    if (!files.length || !id || !user?.id) return;
    setDocUploadBusy(true);
    setMsg(null);
    setError(null);
    let ok = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const safeName = file.name.replace(/[^\w.-]+/g, "_");
        const path = `${user.id}/${id}/${Date.now()}-n${i}-${Math.random().toString(36).slice(2, 10)}-${safeName}`;
        const { error: upErr } = await supabase.storage.from("property-files").upload(path, file, { upsert: false });
        if (upErr) {
          setError(`No se pudo subir «${file.name}»: ${upErr.message}`);
          break;
        }
        const { data: pub } = supabase.storage.from("property-files").getPublicUrl(path);
        const { error: ie } = await supabase.from("PropertyFile").insert({
          property_id: id,
          url: pub.publicUrl,
          mime_type: file.type || null,
          kind: "document",
          label: file.name,
        });
        if (ie) {
          setError(`«${file.name}»: ${ie.message}`);
          break;
        }
        ok += 1;
      }
      if (ok > 0) {
        setMsg(ok === files.length ? `Se cargaron ${ok} archivo(s).` : `Se cargaron ${ok} de ${files.length} archivo(s).`);
        void refreshFiles();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir archivos.");
    } finally {
      setDocUploadBusy(false);
    }
  }

  async function deleteDocumentRow(row: FileRow) {
    if (!canEdit || !id) return;
    if (!window.confirm(`¿Eliminar «${row.label ?? row.kind}»?`)) return;
    setMsg(null);
    const { error: de } = await supabase.from("PropertyFile").delete().eq("id", row.id);
    if (de) setError(de.message);
    else {
      setMsg("Archivo eliminado.");
      void refreshFiles();
    }
  }

  const sharePdfData = useMemo((): PublicPropertyPdfInput | null => {
    if (!property || !fallbackOrg || !id) return null;
    const listing = prices.filter((p) => p.kind === "LISTING_PUBLIC");
    let best: PriceRow | null = null;
    let bestAmt = Number.NEGATIVE_INFINITY;
    for (const pr of listing) {
      const n = Number(pr.amount);
      if (Number.isFinite(n) && n > bestAmt) {
        bestAmt = n;
        best = pr;
      }
    }
    const photo_urls = files
      .filter((f) => f.kind === "photo" || f.kind === "cover")
      .sort((a, b) => {
        if (a.kind === "cover") return -1;
        if (b.kind === "cover") return 1;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      })
      .map((f) => f.url);
    return {
      organization: {
        display_name: fallbackOrg.display_name,
        logo_url: fallbackOrg.logo_url,
        fiscal_address: fallbackOrg.fiscal_address,
        contact_phone: fallbackOrg.contact_phone,
        broker_matricula: fallbackOrg.broker_matricula,
      },
      property: {
        title: property.title,
        city_zone: property.city_zone,
        address: property.address,
        kind: property.kind as PublicPropertyPdfInput["property"]["kind"],
        covered_m2: property.covered_m2,
        total_m2: property.total_m2,
        rooms: property.rooms,
        bathrooms: property.bathrooms,
        parking: property.parking,
        condition: property.condition,
        listing_status: property.listing_status,
        description: property.description,
        amenity_tags: property.amenity_tags,
        is_exclusive: property.is_exclusive,
        geo_unit_id: property.geo_unit_id,
        lat: property.lat,
        lng: property.lng,
        geo_path_labeled: geoPathLabeled,
      },
      public_price: best ? { amount: String(best.amount), currency: best.currency } : null,
      photo_urls,
    };
  }, [property, fallbackOrg, prices, id, files, geoPathLabeled]);

  if (!id) return null;

  const docs = files.filter((f) => f.kind !== "photo" && f.kind !== "cover");
  const photos = files
    .filter((f) => f.kind === "photo" || f.kind === "cover")
    .sort((a, b) => {
      if (a.kind === "cover") return -1;
      if (b.kind === "cover") return 1;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  const peopleMap = new Map(people.map((p) => [p.id, p.name]));

  async function downloadPhotosZip() {
    if (!property || !photos.length) return;
    setZipBusy("photos");
    setError(null);
    try {
      const { downloadUrlsAsZip, sanitizeFilenameBase } = await import("../../lib/download-urls-zip");
      await downloadUrlsAsZip(
        photos.map((p, i) => ({ url: p.url, label: p.label ?? `foto-${i + 1}` })),
        `fotos-${sanitizeFilenameBase(property.title)}`,
      );
      setMsg("ZIP de fotos descargado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el ZIP de fotos.");
    } finally {
      setZipBusy(null);
    }
  }

  async function downloadDocumentsZip() {
    if (!property || !docs.length) return;
    setZipBusy("docs");
    setError(null);
    try {
      const { downloadUrlsAsZip, sanitizeFilenameBase } = await import("../../lib/download-urls-zip");
      await downloadUrlsAsZip(
        docs.map((d, i) => ({ url: d.url, label: d.label ?? `documento-${i + 1}` })),
        `documentos-${sanitizeFilenameBase(property.title)}`,
      );
      setMsg("ZIP de documentos descargado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el ZIP de documentos.");
    } finally {
      setZipBusy(null);
    }
  }

  const documentsInner = (
    <>
      <input
        ref={docInputRef}
        type="file"
        multiple
        className="sr-only"
        disabled={docUploadBusy}
        onChange={(e) => void onUploadDocument(e)}
      />
      {docs.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Sin documentos adjuntos.</p>
      ) : (
        <div className="max-h-[13.5rem] overflow-y-auto overscroll-contain rounded-lg border border-[var(--border)]">
          <ul className="divide-y divide-[var(--border)] text-sm">
            {docs.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
                <span className="min-w-0 flex-1 truncate font-medium">{f.label ?? f.kind}</span>
                <span className="flex shrink-0 items-center gap-1">
                  <a
                    href={f.url}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[var(--accent)] hover:bg-stone-900/5"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="size-3.5" strokeWidth={1.75} />
                    Ver
                  </a>
                  {canEdit ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-red-700 hover:bg-red-50"
                      onClick={() => void deleteDocumentRow(f)}
                    >
                      <Trash2 className="size-3.5" strokeWidth={1.75} />
                      Eliminar
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );

  const documentsCard = (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
      <div className="mb-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Documentos adjuntos</h2>
          <div className="flex shrink-0 items-center gap-1">
            {canEdit ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 w-8 shrink-0 p-0"
                disabled={docUploadBusy}
                onClick={() => docInputRef.current?.click()}
                aria-label="Subir archivos"
                title="Subir archivos"
              >
                <Upload className="size-4" strokeWidth={1.75} />
              </Button>
            ) : null}
            {docs.length > 0 ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 w-8 shrink-0 p-0"
                disabled={zipBusy === "docs"}
                onClick={() => void downloadDocumentsZip()}
                aria-label="Descargar documentos en ZIP"
                title="Descargar ZIP"
              >
                {zipBusy === "docs" ? (
                  <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
                ) : (
                  <Archive className="size-4" strokeWidth={1.75} />
                )}
              </Button>
            ) : null}
          </div>
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">PDF y otros archivos asociados a la propiedad.</p>
        {canEdit && docUploadBusy ? (
          <p className="mt-1 inline-flex items-center gap-2 text-xs text-[var(--muted)]">
            <Loader2 className="size-3.5 animate-spin text-[var(--accent)]" strokeWidth={1.75} />
            Subiendo…
          </p>
        ) : null}
      </div>
      {documentsInner}
    </div>
  );

  const pricesHasOffers = prices.some((p) => p.kind === "OFFER_OPPORTUNITY");
  const pricesShowActionsCol = canEdit || pricesHasOffers;

  const pricesInner = (
    <>
      <table className="mt-4 w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col style={{ width: `${PRICE_APPRAISAL_TBL.fecha}%` }} />
          <col style={{ width: `${PRICE_APPRAISAL_TBL.importe}%` }} />
          <col
            style={{
              width: `${
                pricesShowActionsCol ? priceTipoColPct : priceTipoColPctSinAcciones
              }%`,
            }}
          />
          {pricesShowActionsCol ? (
            <col style={{ width: `${PRICE_APPRAISAL_TBL.acciones}%` }} />
          ) : null}
        </colgroup>
        <thead>
          <tr className="text-left">
            <th className="border-b border-[var(--border)] p-2">Fecha</th>
            <th className="border-b border-[var(--border)] p-2">Importe</th>
            <th className="border-b border-[var(--border)] p-2">Tipo</th>
            {pricesShowActionsCol ? (
              <th className="border-b border-[var(--border)] p-2">Acciones</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {prices.map((pr) => {
            const offerInfo =
              pr.kind === "OFFER_OPPORTUNITY" && pr.source_offer_id
                ? offerOppBySourceId[pr.source_offer_id]
                : undefined;
            const oppHref = offerInfo ? `/dashboard/opportunities/${offerInfo.oppId}` : null;
            return (
              <tr key={pr.id}>
                <td className="border-b border-[var(--border)] p-2 align-middle">
                  {new Date(pr.effective_at).toLocaleDateString()}
                </td>
                <td className="border-b border-[var(--border)] p-2 align-middle font-mono">
                  {pr.currency} {Number(pr.amount).toLocaleString()}
                </td>
                <td className="min-w-0 border-b border-[var(--border)] p-2 align-middle">
                  {pr.kind === "OFFER_OPPORTUNITY" ? (
                    <span title="Sincronizada desde CRM">{PRICE_KIND_LABEL[pr.kind]}</span>
                  ) : (
                    PRICE_KIND_LABEL[pr.kind]
                  )}
                </td>
                {pricesShowActionsCol ? (
                  <td className="min-w-0 border-b border-[var(--border)] p-2 align-middle">
                    {pr.kind === "OFFER_OPPORTUNITY" ? (
                      oppHref && offerInfo ? (
                        <Link
                          to={oppHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex w-full min-w-0 max-w-full items-center gap-1 text-[var(--accent)] hover:underline"
                          title={`Abrir en pestaña nueva: ${offerInfo.title}`}
                        >
                          <span className="truncate font-medium">{offerInfo.title}</span>
                          <ArrowUpRight className="size-3.5 shrink-0 opacity-70" aria-hidden strokeWidth={2} />
                        </Link>
                      ) : (
                        <span className="text-xs text-[var(--muted)]">—</span>
                      )
                    ) : canEdit ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingPrice(pr);
                          setPriceModalOpen(true);
                        }}
                      >
                        Editar
                      </Button>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      {canEdit ? (
        <div className="mt-4">
          <Button
            type="button"
            onClick={() => {
              setEditingPrice(null);
              setPriceModalOpen(true);
            }}
          >
            Agregar precio
          </Button>
        </div>
      ) : null}
    </>
  );

  const pricesCard = (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
      <h2 className="text-lg font-medium">Histórico de precios</h2>
      {pricesInner}
    </div>
  );

  const appraisalsInner = (
    <>
      <table className="mt-4 w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col style={{ width: `${PRICE_APPRAISAL_TBL.fecha}%` }} />
          <col style={{ width: `${PRICE_APPRAISAL_TBL.importe}%` }} />
          <col style={{ width: `${PRICE_APPRAISAL_TBL.origen}%` }} />
          <col
            style={{
              width: `${
                canEdit ? PRICE_APPRAISAL_TBL.tasador : appraisalTasadorColPctSinAcciones
              }%`,
            }}
          />
          {canEdit ? <col style={{ width: `${PRICE_APPRAISAL_TBL.acciones}%` }} /> : null}
        </colgroup>
        <thead>
          <tr className="text-left">
            <th className="border-b border-[var(--border)] p-2">Fecha</th>
            <th className="border-b border-[var(--border)] p-2">Importe</th>
            <th className="border-b border-[var(--border)] p-2">Origen</th>
            <th className="border-b border-[var(--border)] p-2">Tasador</th>
            {canEdit ? (
              <th className="border-b border-[var(--border)] p-2">Acciones</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {appraisals.map((a) => (
            <tr key={a.id}>
              <td className="border-b border-[var(--border)] p-2 align-middle">
                {new Date(a.appraised_at).toLocaleDateString()}
              </td>
              <td className="border-b border-[var(--border)] p-2 align-middle font-mono">
                {a.currency} {Number(a.amount).toLocaleString()}
              </td>
              <td className="min-w-0 border-b border-[var(--border)] p-2 align-middle">
                {a.source === "OWN" ? "Propia" : "Ajena"}
              </td>
              <td className="min-w-0 truncate border-b border-[var(--border)] p-2 align-middle">
                {a.source === "EXTERNAL"
                  ? a.appraiser_name ?? peopleMap.get(a.appraiser_id ?? "") ?? "—"
                  : peopleMap.get(a.appraiser_id ?? "") ?? a.appraiser_name ?? "—"}
              </td>
              {canEdit ? (
                <td className="min-w-0 border-b border-[var(--border)] p-2 align-middle">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingAppraisal(a);
                      setAppraisalModalOpen(true);
                    }}
                  >
                    Editar
                  </Button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {canEdit ? (
        <div className="mt-4">
          <Button
            type="button"
            onClick={() => {
              setEditingAppraisal(null);
              setAppraisalModalOpen(true);
            }}
          >
            Agregar tasación
          </Button>
        </div>
      ) : null}
    </>
  );

  const appraisalsCard = (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
      <h2 className="text-lg font-medium">Tasaciones</h2>
      {appraisalsInner}
    </div>
  );

  function handleBack() {
    if (dirty && !window.confirm("Tenés cambios sin guardar. ¿Querés volver igual?")) {
      return;
    }
    nav(-1);
  }

  async function deleteProperty() {
    if (!id || !canEdit) return;
    if (!window.confirm("¿Eliminar esta propiedad? Se borran precios, archivos, tasaciones y vínculos con oportunidades.")) return;
    const { error: delErr } = await supabase.from("Property").delete().eq("id", id);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    nav("/dashboard/properties");
  }

  return (
    <RequirePermission slug="view_properties">
      <div className="space-y-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-start lg:justify-between">
          <div className="hidden min-w-0 lg:block">
            <p className="text-sm text-[var(--muted)]">
              <Link to="/dashboard/properties" className="text-[var(--accent)] hover:underline">
                Propiedades
              </Link>{" "}
              / {property?.title ?? "…"}
            </p>
            <h1 className="text-2xl font-semibold">{property?.title ?? "Propiedad"}</h1>
          </div>
          <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3 lg:hidden">
            <Button type="button" variant="ghost" size="sm" className="shrink-0 px-2" onClick={handleBack} aria-label="Volver">
              <ChevronLeft className="size-6" strokeWidth={1.75} />
            </Button>
            <h1 className="min-w-0 flex-1 truncate text-center text-base font-semibold">{property?.title ?? "Propiedad"}</h1>
            {property && id ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 px-2"
                onClick={() => setShareModalOpen(true)}
                aria-label="Compartir"
              >
                <Share2 className="size-4" strokeWidth={1.75} />
              </Button>
            ) : (
              <span className="size-9 shrink-0" aria-hidden />
            )}
            {canEdit && property ? (
              <Button type="button" variant="secondary" size="sm" className="shrink-0 gap-1 px-2" onClick={() => setMobileMoreOpen(true)}>
                <Menu className="size-4" strokeWidth={1.75} />
                <span className="text-xs font-medium">Más</span>
              </Button>
            ) : (
              <span className="size-9 shrink-0" aria-hidden />
            )}
          </div>
          <p className="text-sm text-[var(--muted)] lg:hidden">
            <Link to="/dashboard/properties" className="text-[var(--accent)] hover:underline">
              Propiedades
            </Link>{" "}
            / {property?.title ?? "…"}
          </p>
          <div className="hidden flex-wrap items-center justify-end gap-2 lg:flex">
            {property && id ? (
              <Button
                type="button"
                variant="secondary"
                className="gap-2"
                onClick={() => setShareModalOpen(true)}
              >
                <Share2 className="size-4" strokeWidth={1.75} />
                Compartir
              </Button>
            ) : null}
          </div>
        </div>
        {loading ? <p className="text-[var(--muted)]">Cargando…</p> : null}
        {error ? <p className="text-red-400">{error}</p> : null}
        {msg ? <p className="text-[var(--accent)]">{msg}</p> : null}

        {mdUp && canEdit && property ? (
          <PropertyDetailEditForm
            property={property}
            editFormKey={editFormKey}
            editTab={editTab}
            setEditTab={setEditTab}
            dirty={dirty}
            setDirty={setDirty}
            onSubmit={onUpdate}
            mainSaving={mainSaving}
          />
        ) : null}

        {!mdUp && mobileMoreOpen && canEdit && property ? (
          <div className="fixed inset-0 z-[60] flex flex-col bg-[var(--background)] lg:hidden">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
              <span className="text-sm font-semibold">Datos, precios y documentos</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setMobileMoreOpen(false)} aria-label="Cerrar panel">
                <X className="size-5" strokeWidth={1.75} />
              </Button>
            </div>
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-4">
              <PropertyDetailEditForm
                property={property}
                editFormKey={editFormKey}
                editTab={editTab}
                setEditTab={setEditTab}
                dirty={dirty}
                setDirty={setDirty}
                onSubmit={onUpdate}
                mainSaving={mainSaving}
              />
              {documentsCard}
              {pricesCard}
              {appraisalsCard}
            </div>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <div id="fotos-galeria" className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={photoUploadBusy}
              onChange={(e) => void onUploadPhoto(e)}
            />
            <div className="mb-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-medium">Fotos</h2>
                <div className="flex shrink-0 items-center gap-1">
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 w-8 shrink-0 p-0"
                      disabled={photoUploadBusy}
                      onClick={() => photoInputRef.current?.click()}
                      aria-label="Subir imágenes"
                      title="Subir imágenes"
                    >
                      <ImageUp className="size-4" strokeWidth={1.75} />
                    </Button>
                  ) : null}
                  {photos.length > 0 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 w-8 shrink-0 p-0"
                      disabled={zipBusy === "photos"}
                      onClick={() => void downloadPhotosZip()}
                      aria-label="Descargar fotos en ZIP"
                      title="Descargar ZIP"
                    >
                      {zipBusy === "photos" ? (
                        <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
                      ) : (
                        <Archive className="size-4" strokeWidth={1.75} />
                      )}
                    </Button>
                  ) : null}
                </div>
              </div>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Subí una o varias imágenes y completá orden y portada en la galería.
              </p>
              {canEdit && photoUploadBusy ? (
                <p className="mt-1 inline-flex items-center gap-2 text-xs text-[var(--muted)]">
                  <Loader2 className="size-3.5 animate-spin text-[var(--accent)]" strokeWidth={1.75} />
                  Subiendo…
                </p>
              ) : null}
            </div>
            {photos.length > 0 ? (
              <div className="mb-4 max-h-[13.5rem] overflow-y-auto overscroll-contain pr-1">
                <div className="grid grid-cols-4 gap-2">
                  {photos.map((ph, i) => (
                    <button
                      key={ph.id}
                      type="button"
                      onClick={() => setPhotoLbIndex(i)}
                      className={[
                        "relative block aspect-square overflow-hidden rounded-lg border bg-[#f5f0e8] text-left",
                        ph.kind === "cover" ? "border-amber-400 ring-2 ring-amber-300/60" : "border-[var(--border)]",
                      ].join(" ")}
                      title={ph.kind === "cover" ? "Portada · ampliar (deslizar entre fotos)" : "Ampliar · deslizar entre fotos"}
                    >
                      <img src={ph.url} alt="" className="size-full object-cover" />
                      {ph.kind === "cover" ? (
                        <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          Portada
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mb-4 text-sm text-[var(--muted)]">Todavía no hay fotos.</p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-3">
              <p className="text-sm text-[var(--muted)]">{photos.length} foto(s)</p>
              <Link to={`/dashboard/properties/${id}/photos`}>
                <Button type="button" variant="secondary">
                  Ir a galería
                </Button>
              </Link>
            </div>
          </div>

          {mdUp ? documentsCard : null}
        </div>

        {mdUp ? pricesCard : null}
        {mdUp ? appraisalsCard : null}

        {!mdUp && !canEdit ? (
          <div className="space-y-4">
            <CollapsibleCard title="Documentos adjuntos" subtitle="PDF y otros archivos asociados a la propiedad.">
              {documentsInner}
            </CollapsibleCard>
            <CollapsibleCard title="Histórico de precios">{pricesInner}</CollapsibleCard>
            <CollapsibleCard title="Tasaciones">{appraisalsInner}</CollapsibleCard>
          </div>
        ) : null}

        <PhotoLightbox
          open={photoLbIndex !== null && photos.length > 0}
          items={photos.map((p) => ({ id: p.id, url: p.url, label: p.label }))}
          index={photoLbIndex ?? 0}
          onClose={() => setPhotoLbIndex(null)}
          onIndexChange={setPhotoLbIndex}
          footer={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to={`/dashboard/properties/${id}/photos`}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="border-white/20 bg-white/10 text-white hover:bg-white/20"
                >
                  Orden y portada en galería
                </Button>
              </Link>
            </div>
          }
        />

        <Modal
          open={priceModalOpen}
          title={editingPrice ? "Editar precio" : "Agregar precio"}
          onClose={() => {
            setPriceModalOpen(false);
            setEditingPrice(null);
          }}
          footer={
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPriceModalOpen(false);
                  setEditingPrice(null);
                }}
              >
                Cancelar
              </Button>
              <Button form="price-form" type="submit" disabled={priceSaving}>
                {priceSaving ? "Guardando…" : "Guardar"}
              </Button>
            </>
          }
        >
          <form
            id="price-form"
            key={editingPrice?.id ?? "new-price"}
            onSubmit={savePrice}
            className="grid gap-3"
          >
            <Input name="amount" type="number" step="any" placeholder="Importe" required defaultValue={editingPrice?.amount ?? ""} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="effective_date">Fecha vigencia</Label>
                <Input
                  id="effective_date"
                  name="effective_date"
                  type="date"
                  required
                  className="mt-1"
                  defaultValue={
                    isoToDateAndTime(editingPrice?.effective_at).date || todayDateInputValue()
                  }
                />
              </div>
              <div>
                <Label htmlFor="effective_time">Hora</Label>
                <select
                  id="effective_time"
                  name="effective_time"
                  defaultValue={isoToDateAndTime(editingPrice?.effective_at).time}
                  className="mt-1 flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm tabular-nums"
                >
                  {TIME_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label htmlFor="price-currency">Moneda</Label>
              <CurrencySelect id="price-currency" name="currency" defaultValue={editingPrice?.currency ?? "USD"} className="mt-1" />
            </div>
            <select
              name="kind"
              defaultValue={editingPrice?.kind ?? "LISTING_PUBLIC"}
              className="h-10 rounded-lg border border-[var(--border)] bg-[#fffcf7] px-2 text-sm"
            >
              <option value="LISTING_PUBLIC">Público</option>
              <option value="LISTING_RESERVED">Reservado</option>
            </select>
            <Input name="note" placeholder="Nota" defaultValue={editingPrice?.note ?? ""} />
          </form>
        </Modal>

        <Modal
          open={appraisalModalOpen}
          title={editingAppraisal ? "Editar tasación" : "Agregar tasación"}
          onClose={() => {
            setAppraisalModalOpen(false);
            setEditingAppraisal(null);
          }}
          footer={
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAppraisalModalOpen(false);
                  setEditingAppraisal(null);
                }}
              >
                Cancelar
              </Button>
              <Button form="appraisal-form" type="submit" disabled={appraisalSaving}>
                {appraisalSaving ? "Guardando…" : "Guardar"}
              </Button>
            </>
          }
        >
          <form
            id="appraisal-form"
            key={editingAppraisal?.id ?? "new-appraisal"}
            onSubmit={saveAppraisal}
            className="grid gap-3"
          >
            <Input
              name="amount"
              type="number"
              step="any"
              placeholder="Importe"
              required
              defaultValue={editingAppraisal?.amount ?? ""}
            />
            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0">
                <Label htmlFor="appraised_date">Fecha tasación</Label>
                <Input
                  id="appraised_date"
                  name="appraised_date"
                  type="date"
                  required
                  className="mt-1"
                  defaultValue={
                    isoToDateAndTime(editingAppraisal?.appraised_at).date || todayDateInputValue()
                  }
                />
              </div>
              <div className="min-w-0">
                <Label htmlFor="appraisal-currency">Moneda</Label>
                <CurrencySelect
                  id="appraisal-currency"
                  name="currency"
                  defaultValue={editingAppraisal?.currency ?? "USD"}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="appraisal-reference-note">Nota ref.</Label>
              <Input
                id="appraisal-reference-note"
                name="reference_note"
                placeholder="Nota ref."
                className="mt-1"
                defaultValue={editingAppraisal?.reference_note ?? ""}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="appraisal-source">Origen</Label>
              <select
                id="appraisal-source"
                value={tasacionModalSource}
                onChange={(ev) => {
                  const v = ev.target.value as AppraisalSource;
                  setTasacionModalSource(v);
                  if (v === "OWN") setTasacionModalAppraiserKey("");
                }}
                className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-2 text-sm"
              >
                <option value="OWN">Propia</option>
                <option value="EXTERNAL">Ajena</option>
              </select>
            </div>
            {tasacionModalSource === "EXTERNAL" ? (
              <div className="space-y-3 rounded-lg border border-[var(--border)]/70 bg-[#fffcf7]/40 p-3">
                <div className="space-y-1">
                  <Label htmlFor="appraisal-appraiser-select">Tasador</Label>
                  <select
                    id="appraisal-appraiser-select"
                    value={tasacionModalAppraiserKey}
                    onChange={(ev) => setTasacionModalAppraiserKey(ev.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-2 text-sm"
                  >
                    <option value="">Elegí tasador…</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    <option value={EXTERNAL_APPRAISER_OTHER}>Otro</option>
                  </select>
                  <p className="text-[11px] text-[var(--muted)]">
                    «Otro» no crea persona en el CRM; usá nombre libre abajo.
                  </p>
                </div>
                {tasacionModalAppraiserKey === EXTERNAL_APPRAISER_OTHER ? (
                  <div className="space-y-1">
                    <Label htmlFor="appraisal-appraiser-free-name">Nombre del tasador</Label>
                    <Input
                      id="appraisal-appraiser-free-name"
                      key={`${editingAppraisal?.id ?? "new"}-${EXTERNAL_APPRAISER_OTHER}`}
                      name="appraiser_name"
                      placeholder="Nombre y apellido o estudio"
                      className="mt-1"
                      defaultValue={editingAppraisal?.appraiser_name ?? ""}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </form>
        </Modal>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-4">
          <Button type="button" variant="ghost" onClick={handleBack}>
            Volver
          </Button>
          {canEdit && property ? (
            <Button type="button" variant="danger" onClick={() => void deleteProperty()}>
              Eliminar
            </Button>
          ) : null}
        </div>

        {property && id ? (
          <PropertyShareModal
            open={shareModalOpen}
            onClose={() => setShareModalOpen(false)}
            propertyId={id}
            pdfData={sharePdfData}
          />
        ) : null}
      </div>
    </RequirePermission>
  );
}

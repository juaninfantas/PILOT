import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Archive, ArchiveRestore, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { MatchScoreInfoButton } from "../../components/scoring/MatchScoreInfoButton";
import { supabase } from "../../lib/supabase";
import { useCurrencyCatalog } from "../../contexts/CurrencyCatalogContext";
import { useAuth } from "../../contexts/AuthContext";
import { hasPermission } from "../../lib/permissions";
import { recomputeMatchingForPerson } from "../../lib/recompute-matching";
import { rankPropertiesForPerson, type RankedProperty } from "../../lib/compute-opportunity-scores";
import { RequirePermission } from "../../components/RequirePermission";
import { PropertyPriceAppraisalChart } from "../../components/PropertyPriceAppraisalChart";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { PROPERTY_KIND_LABEL } from "../../lib/property-options";
import {
  ACTIVITY_TYPE_LABEL,
  OFFER_IN_OPP_STATUS_LABEL,
  OPPORTUNITY_CREATION_MODE_LABEL,
  OPPORTUNITY_STATUS_LABEL,
  OPP_PROPERTY_LINK_STATUS_LABEL,
  activityTypeLabel,
  opportunityStatusLabel,
} from "../../lib/crm-labels";
import type { ActivityType, Database, OfferInOpportunityStatus, OppPropertyLinkStatus } from "../../types/database";
import { Modal } from "../../components/ui/modal";
import { PropertyAmountDateFormFields } from "../../components/property/PropertyAmountDateFormFields";
import { normalizeCurrencyCode } from "../../lib/currencies";
import { combineLocalDateTime, isoToDateAndTime, todayDateInputValue } from "../../lib/datetime-form";
import { cn } from "../../lib/utils";
import { TIME_OPTIONS } from "../../lib/time-options";

type Opp = Database["public"]["Tables"]["Opportunity"]["Row"];
type Act = Database["public"]["Tables"]["OpportunityActivity"]["Row"];
type PropRow = Database["public"]["Tables"]["Property"]["Row"];
type LinkRow = Database["public"]["Tables"]["OpportunityProperty"]["Row"];
type OfferRow = Database["public"]["Tables"]["OpportunityPropertyOffer"]["Row"];
type PriceRow = Database["public"]["Tables"]["PropertyPrice"]["Row"];
type AppraisalRow = Database["public"]["Tables"]["PropertyAppraisal"]["Row"];
type Funnel = Database["public"]["Tables"]["Funnel"]["Row"];
type Stage = Database["public"]["Tables"]["FunnelStage"]["Row"];

type PropertyPickerRow = {
  id: string;
  title: string;
  score: number | null;
  explain?: RankedProperty["explain"] | null;
};

export function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { codeSet } = useCurrencyCatalog();
  const { permissions, user } = useAuth();
  const canEdit = hasPermission(permissions, "manage_opportunities");
  const [opp, setOpp] = useState<Opp | null>(null);
  const [personName, setPersonName] = useState("");
  const [activities, setActivities] = useState<Act[]>([]);
  const [propertyPickerRows, setPropertyPickerRows] = useState<PropertyPickerRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [links, setLinks] = useState<(LinkRow & { Property?: PropRow })[]>([]);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Act | null>(null);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [activitySaving, setActivitySaving] = useState(false);
  const [offerSavingFor, setOfferSavingFor] = useState<string | null>(null);
  /** Formulario «Registrar oferta» en modal (solo `property_id` activo). */
  const [offerModalPropertyId, setOfferModalPropertyId] = useState<string | null>(null);
  const [seriesByProp, setSeriesByProp] = useState<
    Record<string, { prices: PriceRow[]; appraisals: AppraisalRow[] }>
  >({});
  /** property_id → panel expandido */
  const [cardOpen, setCardOpen] = useState<Record<string, boolean>>({});
  const [propertiesTab, setPropertiesTab] = useState<"active" | "archived">("active");
  const embudoColumnRef = useRef<HTMLDivElement>(null);
  const [embudoHeightPx, setEmbudoHeightPx] = useState<number | null>(null);
  const [isLgLayout, setIsLgLayout] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [draftStatus, setDraftStatus] = useState<Database["public"]["Tables"]["Opportunity"]["Row"]["status"]>("OPEN");
  const [draftFunnelId, setDraftFunnelId] = useState<string>("");
  const [draftStageId, setDraftStageId] = useState<string>("");
  const [draftLostReason, setDraftLostReason] = useState<string>("");
  const [funnelModalOpen, setFunnelModalOpen] = useState(false);

  function syncFunnelDraftFromOpp(current: Opp) {
    setDraftStatus(current.status);
    setDraftFunnelId(current.funnel_id ?? "");
    setDraftStageId(current.stage_id ?? "");
    setDraftLostReason(current.lost_reason ?? "");
  }

  function closeFunnelModal() {
    if (!opp) {
      setFunnelModalOpen(false);
      return;
    }
    const dirty =
      draftStatus !== opp.status ||
      draftFunnelId !== (opp.funnel_id ?? "") ||
      draftStageId !== (opp.stage_id ?? "") ||
      (draftLostReason ?? "") !== (opp.lost_reason ?? "");
    if (dirty && !window.confirm("¿Cerrar sin guardar? Los cambios se descartarán.")) return;
    syncFunnelDraftFromOpp(opp);
    setFunnelModalOpen(false);
  }
  const currentFunnel = useMemo(() => funnels.find((f) => f.id === opp?.funnel_id) ?? null, [funnels, opp?.funnel_id]);
  const currentStageList = useMemo(
    () => stages.filter((st) => st.funnel_id === opp?.funnel_id).sort((a, b) => a.position - b.position),
    [stages, opp?.funnel_id],
  );
  const isLastStage = Boolean(opp?.stage_id && currentStageList[currentStageList.length - 1]?.id === opp.stage_id);

  const orgFunnels = useMemo(() => {
    if (!opp) return [];
    const byOrg = opp.organization_id
      ? funnels.filter((f) => f.organization_id === opp.organization_id)
      : funnels;
    const ensureCurrent =
      opp.funnel_id && !byOrg.some((f) => f.id === opp.funnel_id)
        ? funnels.filter((f) => f.id === opp.funnel_id)
        : [];
    const merged = [...byOrg, ...ensureCurrent];
    const uniq = merged.filter((f, i, arr) => arr.findIndex((x) => x.id === f.id) === i);
    return uniq.sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [funnels, opp]);

  /** Propiedad con oferta no descartada: no se puede destildar del picker si sigue vinculada. */
  const propertyIdsWithActiveOffer = useMemo(() => {
    const set = new Set<string>();
    for (const o of offers) {
      if (o.status === "DISCARDED") continue;
      set.add(o.property_id);
    }
    return set;
  }, [offers]);

  useEffect(() => {
    if (!opp || funnelModalOpen) return;
    setDraftStatus(opp.status);
    setDraftFunnelId(opp.funnel_id ?? "");
    setDraftStageId(opp.stage_id ?? "");
    setDraftLostReason(opp.lost_reason ?? "");
  }, [opp, funnelModalOpen]);

  const stagesForDraftFunnel = useMemo(() => {
    if (!draftFunnelId) return [];
    return [...stages].filter((st) => st.funnel_id === draftFunnelId).sort((a, b) => a.position - b.position);
  }, [stages, draftFunnelId]);

  const filteredPickerRows = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return propertyPickerRows;
    return propertyPickerRows.filter((p) => p.title.toLowerCase().includes(q));
  }, [propertyPickerRows, pickerQuery]);

  const linksActive = useMemo(() => links.filter((l) => !l.archived_at), [links]);
  const linksArchived = useMemo(() => links.filter((l) => l.archived_at), [links]);

  const visiblePropertyLinks =
    propertiesTab === "active" ? linksActive : linksArchived;

  useEffect(() => {
    if (propertiesTab === "archived" && linksArchived.length === 0) {
      setPropertiesTab("active");
    }
  }, [propertiesTab, linksArchived.length]);

  const sortedActivities = useMemo(() => {
    return [...activities].sort((a, b) => {
      const la = [activityTypeLabel(a.type), (a.title ?? "").trim(), a.notes ?? ""].join("\u0001");
      const lb = [activityTypeLabel(b.type), (b.title ?? "").trim(), b.notes ?? ""].join("\u0001");
      return la.localeCompare(lb, "es", { sensitivity: "base" });
    });
  }, [activities]);

  async function load() {
    if (!id) return;
    const [{ data: o }, { data: f }, { data: s }] = await Promise.all([
      supabase.from("Opportunity").select("*").eq("id", id).maybeSingle(),
      supabase.from("Funnel").select("*").order("name"),
      supabase.from("FunnelStage").select("*").order("position"),
    ]);
    /* Un solo batch: si setOpp corre antes que funnels/etapas, los <select> defaultValue quedan en blanco para siempre. */
    setFunnels((f as Funnel[]) ?? []);
    setStages((s as Stage[]) ?? []);
    setOpp(o as Opp);
    if (o) {
      const { data: per } = await supabase.from("Person").select("name").eq("id", o.person_id).maybeSingle();
      setPersonName((per as { name: string } | null)?.name ?? "");
    } else {
      setPersonName("");
    }
    const { data: acts } = await supabase.from("OpportunityActivity").select("*").eq("opportunity_id", id).order("created_at", { ascending: false });
    setActivities((acts as Act[]) ?? []);
    const { data: lp } = await supabase.from("OpportunityProperty").select("*").eq("opportunity_id", id);
    const raw = (lp as LinkRow[]) ?? [];
    const propIds = raw.map((r) => r.property_id);
    const { data: props } = propIds.length
      ? await supabase.from("Property").select("*").in("id", propIds)
      : { data: [] as PropRow[] };
    const byId = Object.fromEntries(((props as PropRow[]) ?? []).map((p) => [p.id, p]));
    setLinks(raw.map((r) => ({ ...r, Property: byId[r.property_id] })));
    setSelected(raw.map((r) => r.property_id));
    const { data: offerRows } = await supabase.from("OpportunityPropertyOffer").select("*").eq("opportunity_id", id);
    setOffers((offerRows as OfferRow[]) ?? []);
    if (o) {
      void (async () => {
        const { ranked } = await rankPropertiesForPerson(o.organization_id, o.person_id);
        if (ranked.length) {
          setPropertyPickerRows(
            ranked.map((r) => ({
              id: r.property_id,
              title: r.title,
              score: r.score,
              explain: r.explain,
            })),
          );
        } else {
          const { data } = await supabase
            .from("Property")
            .select("id, title")
            .eq("organization_id", o.organization_id)
            .order("title");
          setPropertyPickerRows(
            ((data as { id: string; title: string }[]) ?? []).map((p) => ({
              id: p.id,
              title: p.title,
              score: null,
              explain: null,
            })),
          );
        }
      })();
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setIsLgLayout(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useLayoutEffect(() => {
    if (!isLgLayout) {
      setEmbudoHeightPx(null);
      return;
    }
    const el = embudoColumnRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) setEmbudoHeightPx(Math.round(h));
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [isLgLayout, opp?.id, opp?.updated_at, canEdit, currentFunnel?.id, currentFunnel?.is_system, isLastStage]);

  useEffect(() => {
    if (!links.length) {
      setSeriesByProp({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const map: Record<string, { prices: PriceRow[]; appraisals: AppraisalRow[] }> = {};
      await Promise.all(
        links.map(async (l) => {
          const pid = l.property_id;
          const [pr, ap] = await Promise.all([
            supabase
              .from("PropertyPrice")
              .select("*")
              .eq("property_id", pid)
              .in("kind", ["LISTING_PUBLIC", "OFFER_OPPORTUNITY"])
              .order("effective_at", { ascending: true }),
            supabase.from("PropertyAppraisal").select("*").eq("property_id", pid).order("appraised_at", { ascending: true }),
          ]);
          map[pid] = {
            prices: (pr.data as PriceRow[]) ?? [],
            appraisals: (ap.data as AppraisalRow[]) ?? [],
          };
        }),
      );
      if (!cancelled) setSeriesByProp(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [links]);

  async function appendFunnelHistoryRow(
    prev: Pick<Opp, "funnel_id" | "stage_id" | "status">,
    next: { funnel_id: string | null; stage_id: string | null; status: Opp["status"] },
    reason: string | null,
  ) {
    if (!id || !user?.id) return;
    const sameFunnel = (prev.funnel_id ?? null) === next.funnel_id;
    const sameStage = (prev.stage_id ?? null) === next.stage_id;
    const sameStatus = prev.status === next.status;
    if (sameFunnel && sameStage && sameStatus) return;
    const { error: histErr } = await supabase.from("OpportunityFunnelHistory").insert({
      opportunity_id: id,
      from_funnel_id: prev.funnel_id,
      to_funnel_id: next.funnel_id,
      from_stage_id: prev.stage_id,
      to_stage_id: next.stage_id,
      from_status: prev.status,
      to_status: next.status,
      reason,
      changed_by_id: user.id,
    });
    if (histErr) console.error("OpportunityFunnelHistory", histErr);
  }

  async function saveStatus(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!id || !opp) return;
    const prev = opp;
    const funnel_id = draftFunnelId.trim() || null;
    let stage_id = draftStageId.trim() || null;
    if (funnel_id && stage_id) {
      const stageOk = stages.some((st) => st.id === stage_id && st.funnel_id === funnel_id);
      if (!stageOk) stage_id = null;
    }
    const lost_reason = draftStatus === "LOST" ? draftLostReason.trim() || null : null;
    const { error } = await supabase
      .from("Opportunity")
      .update({ status: draftStatus, lost_reason, funnel_id, stage_id })
      .eq("id", id);
    if (error) setMsg(error.message);
    else {
      await appendFunnelHistoryRow(
        prev,
        { funnel_id, stage_id, status: draftStatus },
        draftStatus === "LOST" ? lost_reason : null,
      );
      setMsg("Estado actualizado.");
      setFunnelModalOpen(false);
      void load();
    }
  }

  async function setLinkArchived(property_id: string, archived: boolean) {
    if (!id) return;
    const archived_at = archived ? new Date().toISOString() : null;
    const { error } = await supabase
      .from("OpportunityProperty")
      .update({ archived_at })
      .eq("opportunity_id", id)
      .eq("property_id", property_id);
    if (error) setMsg(error.message);
    else {
      setMsg(archived ? "Propiedad archivada." : "Propiedad reactivada.");
      void load();
    }
  }

  async function closeOpportunity(status: "WON" | "LOST" | "ONHOLD") {
    if (!id || !opp) return;
    const prev = opp;
    const label =
      status === "WON" ? "ganada" : status === "LOST" ? "perdida" : OPPORTUNITY_STATUS_LABEL.ONHOLD.toLowerCase();
    const ok = window.confirm(`¿Seguro que querés marcar esta oportunidad como ${label}?`);
    if (!ok) return;
    const systemFunnel = funnels.find((f) => f.is_system && f.system_type === status);
    const systemStage = stages
      .filter((s) => s.funnel_id === systemFunnel?.id)
      .sort((a, b) => a.position - b.position)[0];
    if (!systemFunnel || !systemStage) {
      setMsg("No se encontró funnel de sistema para ese estado.");
      return;
    }
    const funnel_id = systemFunnel.id;
    const stage_id = systemStage.id;
    const { error } = await supabase
      .from("Opportunity")
      .update({ status, funnel_id, stage_id })
      .eq("id", id);
    if (error) setMsg(error.message);
    else {
      await appendFunnelHistoryRow(prev, { funnel_id, stage_id, status }, null);
      setMsg(`Oportunidad marcada como ${label}.`);
      setFunnelModalOpen(false);
      void load();
    }
  }

  async function saveActivityFromModal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!id || activitySaving) return;
    const fd = new FormData(e.currentTarget);
    const date = String(fd.get("due_date") ?? "").trim();
    const time = String(fd.get("due_time") ?? "09:00").trim();
    const due_at = date ? combineLocalDateTime(date, time) : null;
    const propRaw = String(fd.get("property_id") ?? "").trim();
    const property_id = propRaw.length ? propRaw : null;
    if (property_id && !links.some((l) => l.property_id === property_id)) {
      setMsg("Elegí una propiedad que esté vinculada a esta oportunidad (o ninguna).");
      return;
    }
    const payload = {
      type: String(fd.get("type") ?? "NOTE") as ActivityType,
      title: String(fd.get("title") ?? "").trim() || null,
      notes: String(fd.get("notes") ?? "").trim() || null,
      due_at,
      property_id,
    };
    setActivitySaving(true);
    const { error } = editingActivity
      ? await supabase.from("OpportunityActivity").update(payload).eq("id", editingActivity.id)
      : await supabase.from("OpportunityActivity").insert({ opportunity_id: id, ...payload });
    setActivitySaving(false);
    if (error) setMsg(error.message);
    else {
      setMsg(editingActivity ? "Actividad actualizada." : "Actividad registrada.");
      setActivityModalOpen(false);
      setEditingActivity(null);
      void load();
    }
  }

  async function deleteActivity(row: Act) {
    if (!canEdit) return;
    if (!window.confirm("¿Eliminar esta actividad?")) return;
    const { error } = await supabase.from("OpportunityActivity").delete().eq("id", row.id);
    if (error) setMsg(error.message);
    else {
      setMsg("Actividad eliminada.");
      void load();
    }
  }

  function openNewActivityModal() {
    setEditingActivity(null);
    setActivityModalOpen(true);
  }

  function openEditActivityModal(row: Act) {
    setEditingActivity(row);
    setActivityModalOpen(true);
  }

  async function saveLinks(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!id || !opp) return;
    const propertyIds = selected;
    const prev = new Set(links.map((l) => l.property_id));
    const next = new Set(propertyIds);
    const toRemove = [...prev].filter((pid) => !next.has(pid));
    const toAdd = [...next].filter((pid) => !prev.has(pid));
    const blocked = toRemove.filter((pid) => propertyIdsWithActiveOffer.has(pid));
    if (blocked.length) {
      setMsg("No podés quitar del vínculo una propiedad que tiene una oferta activa (propuesta o aceptada). Descartá o resolvé la oferta antes.");
      return;
    }
    if (toRemove.length) {
      await supabase
        .from("OpportunityActivity")
        .update({ property_id: null })
        .eq("opportunity_id", id)
        .in("property_id", toRemove);
      await supabase.from("OpportunityProperty").delete().eq("opportunity_id", id).in("property_id", toRemove);
    }
    if (toAdd.length) {
      await supabase.from("OpportunityProperty").insert(
        toAdd.map((property_id) => ({
          opportunity_id: id,
          property_id,
        })),
      );
    }
    const r = await recomputeMatchingForPerson(opp.person_id);
    if (r.error) setMsg(`Vínculos guardados. Matching: ${r.error}`);
    else setMsg("Vínculos guardados y matching actualizado.");
    void load();
  }

  async function updateLinkStatus(property_id: string, link_status: OppPropertyLinkStatus) {
    if (!id) return;
    const { error } = await supabase
      .from("OpportunityProperty")
      .update({ link_status })
      .eq("opportunity_id", id)
      .eq("property_id", property_id);
    if (error) setMsg(error.message);
    else {
      setMsg("Estado de la propiedad actualizado.");
      void load();
    }
  }

  async function updateOfferStatus(offerId: string, status: OfferInOpportunityStatus) {
    const statusLabel = OFFER_IN_OPP_STATUS_LABEL[status];
    const { data: offerRow, error: fetchErr } = await supabase
      .from("OpportunityPropertyOffer")
      .select("property_id")
      .eq("id", offerId)
      .maybeSingle();
    if (fetchErr || !offerRow) {
      setMsg(fetchErr?.message ?? "No se encontró la oferta.");
      return;
    }
    const propertyId = offerRow.property_id;

    const { error } = await supabase.from("OpportunityPropertyOffer").update({ status }).eq("id", offerId);
    if (error) {
      setMsg(error.message);
      return;
    }

    const { error: pe } = await supabase
      .from("PropertyPrice")
      .update({ note: `Oferta · oportunidad (${statusLabel})` })
      .eq("source_offer_id", offerId);

    const parts: string[] = [];
    if (status === "ACCEPTED") {
      const { data: prop } = await supabase.from("Property").select("listing_status").eq("id", propertyId).maybeSingle();
      if (prop?.listing_status && prop.listing_status !== "ARCHIVED") {
        const { error: le } = await supabase.from("Property").update({ listing_status: "RESERVED" }).eq("id", propertyId);
        if (le) parts.push(`Estado comercial no actualizado: ${le.message}`);
        else parts.push("Propiedad marcada como reservada.");
      }
    } else {
      const { count, error: ce } = await supabase
        .from("OpportunityPropertyOffer")
        .select("*", { count: "exact", head: true })
        .eq("property_id", propertyId)
        .eq("status", "ACCEPTED");
      if (!ce && (count ?? 0) === 0) {
        const { data: prop } = await supabase.from("Property").select("listing_status").eq("id", propertyId).maybeSingle();
        if (prop?.listing_status === "RESERVED") {
          const { error: le } = await supabase.from("Property").update({ listing_status: "AVAILABLE" }).eq("id", propertyId);
          if (le) parts.push(`Estado comercial: ${le.message}`);
          else parts.push("Sin ofertas aceptadas: propiedad vuelve a disponible.");
        }
      }
    }

    if (pe) setMsg(`Oferta actualizada; nota en precios no sincronizada: ${pe.message}${parts.length ? ` ${parts.join(" ")}` : ""}`);
    else {
      const base = "Estado de oferta actualizado y reflejado en la propiedad.";
      setMsg(parts.length ? `${base} ${parts.join(" ")}` : base);
    }
    void load();
  }

  async function submitOffer(e: React.FormEvent<HTMLFormElement>, property_id: string) {
    e.preventDefault();
    if (!id || !opp || !user?.id || offerSavingFor) return;
    // Capturar antes de los awaits: en handlers async suele pasar que currentTarget queda null.
    const form = e.currentTarget;
    const fd = new FormData(form);
    const amount = fd.get("amount");
    if (!amount) return;
    const dateRaw = String(fd.get("offered_date") ?? "").trim();
    const date = dateRaw || todayDateInputValue();
    const offered_at = combineLocalDateTime(date, "12:00") ?? new Date().toISOString();
    const currency = normalizeCurrencyCode(String(fd.get("currency") ?? "USD"), codeSet);
    const notes = String(fd.get("notes") ?? "").trim() || null;
    setOfferSavingFor(property_id);

    let shouldReload = false;
    try {
      const { data: prevActive, error: prevE } = await supabase
        .from("OpportunityPropertyOffer")
        .select("id")
        .eq("opportunity_id", id)
        .eq("property_id", property_id)
        .in("status", ["PROPOSED", "ACCEPTED"]);
      if (prevE) {
        setMsg(prevE.message);
        return;
      }
      for (const row of prevActive ?? []) {
        await supabase.from("OpportunityPropertyOffer").update({ status: "DISCARDED" }).eq("id", row.id);
        await supabase
          .from("PropertyPrice")
          .update({ note: `Oferta · oportunidad (${OFFER_IN_OPP_STATUS_LABEL.DISCARDED})` })
          .eq("source_offer_id", row.id);
      }

      const { data: offer, error: oe } = await supabase
        .from("OpportunityPropertyOffer")
        .insert({
          opportunity_id: id,
          property_id,
          amount: String(amount),
          currency,
          offered_at,
          notes,
          status: "PROPOSED",
        })
        .select("id")
        .single();
      if (oe || !offer) {
        setMsg(oe?.message ?? "No se pudo crear la oferta");
        return;
      }
      shouldReload = true;
      const { error: pe } = await supabase.from("PropertyPrice").insert({
        property_id,
        amount: String(amount),
        currency,
        kind: "OFFER_OPPORTUNITY",
        effective_at: offered_at,
        note: `Oferta · oportunidad (${OFFER_IN_OPP_STATUS_LABEL.PROPOSED})`,
        created_by_id: user.id,
        source_offer_id: offer.id,
      });
      if (pe) setMsg(pe.message);
      else {
        setMsg("Oferta registrada. La anterior pasó a descartada y se actualizó el precio en la propiedad.");
        form.reset();
        const dateInput = form.elements.namedItem("offered_date") as HTMLInputElement | null;
        if (dateInput) dateInput.value = todayDateInputValue();
        setOfferModalPropertyId(null);
      }
    } finally {
      setOfferSavingFor(null);
    }
    if (shouldReload) void load();
  }

  if (!id) return null;

  return (
    <RequirePermission slug="view_opportunities">
      <div className="space-y-8">
        <p className="text-sm text-[var(--muted)]">
          <Link to="/dashboard/opportunities" className="text-[var(--accent)] hover:underline">
            Oportunidades
          </Link>{" "}
          / {opp?.title ?? "—"}
        </p>
        <h1 className="text-2xl font-semibold">{opp?.title ?? "Oportunidad"}</h1>
        <p className="text-[var(--muted)]">
          Persona: <span className="text-[var(--foreground)]">{personName}</span> · Estado:{" "}
          {opp ? opportunityStatusLabel(opp.status) : "—"}
          {opp?.creation_mode ? (
            <>
              {" "}
              · Modo: {OPPORTUNITY_CREATION_MODE_LABEL[opp.creation_mode]}
            </>
          ) : null}
        </p>
        {msg ? <p className="text-[var(--accent)]">{msg}</p> : null}

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
          <div ref={embudoColumnRef} className="flex min-w-0 flex-1 flex-col space-y-4">
            {canEdit && opp && !currentFunnel?.is_system ? (
              <>
                <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2 className="text-lg font-medium">Embudo · oportunidad</h2>
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0"
                      onClick={() => {
                        syncFunnelDraftFromOpp(opp);
                        setFunnelModalOpen(true);
                      }}
                    >
                      Cambiar funnel
                    </Button>
                  </div>
                  <div className="space-y-3 border-t border-[var(--border)] pt-4 text-sm text-[var(--foreground)]">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Nombre</p>
                      <p className="font-medium">{opp.title?.trim() || "Sin título"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Cliente</p>
                      <p>{personName || "—"}</p>
                    </div>
                    {opp.estimated_value != null && String(opp.estimated_value).trim() !== "" ? (
                      <div>
                        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Valor estimado</p>
                        <p className="font-mono tabular-nums">
                          {(() => {
                            const n = Number(opp.estimated_value);
                            return Number.isFinite(n)
                              ? n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
                              : opp.estimated_value;
                          })()}
                        </p>
                      </div>
                    ) : null}
                    {opp.probability != null ? (
                      <div>
                        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Probabilidad</p>
                        <p>{Math.round(Number(opp.probability))}%</p>
                      </div>
                    ) : null}
                    <div className="grid gap-3 border-t border-[var(--border)] pt-3 sm:grid-cols-2">
                      <p>
                        <span className="text-[var(--muted)]">Embudo:</span> {currentFunnel?.name ?? "—"}
                      </p>
                      <p>
                        <span className="text-[var(--muted)]">Etapa:</span>{" "}
                        {stages.find((s) => s.id === opp.stage_id)?.name ?? "—"}
                      </p>
                      <p className="sm:col-span-2">
                        <span className="text-[var(--muted)]">Estado comercial:</span> {opportunityStatusLabel(opp.status)}
                      </p>
                      {opp.lost_reason?.trim() ? (
                        <p className="sm:col-span-2">
                          <span className="text-[var(--muted)]">Motivo pérdida:</span> {opp.lost_reason}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>

                <Modal
                  open={funnelModalOpen}
                  title="Cambiar funnel"
                  panelClassName="max-w-lg"
                  onClose={closeFunnelModal}
                  footer={
                    <>
                      <Button type="button" variant="ghost" onClick={closeFunnelModal}>
                        Cancelar
                      </Button>
                      <Button type="submit" form={`funnel-move-form-${opp.id}`}>
                        Guardar cambio
                      </Button>
                    </>
                  }
                >
                  <form id={`funnel-move-form-${opp.id}`} onSubmit={saveStatus} className="space-y-4">
                    <p className="text-sm text-[var(--muted)]">
                      Definí el embudo destino y la etapa. El resto de los datos del negocio se siguen viendo abajo sin cambios hasta
                      que guardés.
                    </p>
                    <div>
                      <Label htmlFor="status">Estado</Label>
                      <select
                        id="status"
                        value={draftStatus}
                        onChange={(e) => setDraftStatus(e.target.value as typeof draftStatus)}
                        className="mt-1 flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
                      >
                        <option value="OPEN">{OPPORTUNITY_STATUS_LABEL.OPEN}</option>
                        <option value="WON">{OPPORTUNITY_STATUS_LABEL.WON}</option>
                        <option value="LOST">{OPPORTUNITY_STATUS_LABEL.LOST}</option>
                        <option value="ONHOLD">{OPPORTUNITY_STATUS_LABEL.ONHOLD}</option>
                      </select>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <Label htmlFor="funnel_id">Funnel</Label>
                        <select
                          id="funnel_id"
                          value={draftFunnelId}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraftFunnelId(v);
                            const nextStages = [...stages]
                              .filter((st) => st.funnel_id === v)
                              .sort((a, b) => a.position - b.position);
                            setDraftStageId((prev) =>
                              nextStages.some((s) => s.id === prev) ? prev : (nextStages[0]?.id ?? ""),
                            );
                          }}
                          className="mt-1 flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
                        >
                          <option value="">—</option>
                          {orgFunnels.map((funnel) => (
                            <option key={funnel.id} value={funnel.id}>
                              {funnel.is_system ? `${funnel.name} (sistema)` : funnel.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="stage_id">Etapa</Label>
                        <select
                          id="stage_id"
                          value={draftStageId}
                          onChange={(e) => setDraftStageId(e.target.value)}
                          disabled={!draftFunnelId}
                          className="mt-1 flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm disabled:opacity-50"
                        >
                          <option value="">—</option>
                          {stagesForDraftFunnel.map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="lost_reason">Motivo de pérdida (si está perdida)</Label>
                      <Input id="lost_reason" value={draftLostReason} onChange={(e) => setDraftLostReason(e.target.value)} />
                    </div>
                    {isLastStage ? (
                      <div className="grid gap-2 border-t border-[var(--border)] pt-4">
                        <p className="text-xs text-[var(--muted)]">Última etapa del embudo: cierre rápido</p>
                        <div className="grid grid-cols-3 gap-2">
                          <Button type="button" onClick={() => void closeOpportunity("WON")}>
                            Ganada
                          </Button>
                          <Button type="button" variant="secondary" onClick={() => void closeOpportunity("LOST")}>
                            Perdida
                          </Button>
                          <Button type="button" variant="secondary" onClick={() => void closeOpportunity("ONHOLD")}>
                            En pausa
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </form>
                </Modal>
              </>
            ) : null}
            {canEdit && currentFunnel?.is_system ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted)]">
                <h2 className="text-lg font-medium text-[var(--foreground)]">Estado en embudo</h2>
                <p className="mt-2">
                  Esta oportunidad está en un funnel de sistema y es de solo lectura desde acá. Podés moverla desde el tablero de
                  oportunidades.
                </p>
                {opp ? (
                  <p className="mt-3 text-[var(--foreground)]">
                    <span className="font-medium text-[var(--foreground)]">Embudo:</span>{" "}
                    {currentFunnel?.name ?? "—"} · <span className="font-medium">Etapa:</span>{" "}
                    {stages.find((s) => s.id === opp.stage_id)?.name ?? "—"}
                  </p>
                ) : null}
              </div>
            ) : null}
            {!canEdit && opp ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-sm">
                <h2 className="text-lg font-medium">Estado en embudo</h2>
                <p className="mt-2 text-[var(--foreground)]">
                  <span className="text-[var(--muted)]">Embudo:</span> {currentFunnel?.name ?? "—"}
                  {" · "}
                  <span className="text-[var(--muted)]">Etapa:</span>{" "}
                  {stages.find((s) => s.id === opp.stage_id)?.name ?? "—"}
                </p>
              </div>
            ) : null}
          </div>

          {canEdit ? (
            <form
              onSubmit={saveLinks}
              className={cn(
                "flex min-w-0 flex-1 flex-col space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4",
                isLgLayout && embudoHeightPx != null && "lg:min-h-0 lg:overflow-hidden",
              )}
              style={
                isLgLayout && embudoHeightPx != null
                  ? { height: embudoHeightPx, maxHeight: embudoHeightPx }
                  : undefined
              }
            >
              <div className="shrink-0 space-y-2">
                <h2 className="text-base font-medium">Agregar o quitar propiedades</h2>
                <Label htmlFor="opp-picker-q" className="text-xs">
                  Buscar en la lista
                </Label>
                <Input
                  id="opp-picker-q"
                  placeholder="Nombre de propiedad…"
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto overflow-x-hidden rounded-lg border border-[var(--border)] p-3 sm:grid-cols-2">
                {filteredPickerRows.map((p) => {
                  const checked = selected.includes(p.id);
                  const locked = checked && propertyIdsWithActiveOffer.has(p.id);
                  return (
                    <label
                      key={p.id}
                      className={cn(
                        "flex gap-2 rounded-lg border p-3 text-left transition-colors sm:gap-3",
                        locked
                          ? "cursor-not-allowed border-[var(--border)] bg-stone-500/10 opacity-70"
                          : checked
                            ? "cursor-pointer border-[var(--accent)] bg-[var(--accent)]/5"
                            : "cursor-pointer border-[var(--border)] bg-[var(--card)] hover:bg-stone-900/[0.03]",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={locked}
                        onChange={() => {
                          if (locked) return;
                          setSelected((prev) =>
                            prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id],
                          );
                        }}
                        className="mt-0.5 size-4 shrink-0 rounded border-[var(--border)] disabled:cursor-not-allowed"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium leading-snug text-[var(--foreground)]">{p.title}</div>
                        {p.score != null ? (
                          <div className="mt-1 font-mono text-xs text-[var(--accent)]">Score {p.score.toFixed(1)}</div>
                        ) : (
                          <div className="mt-1 text-xs text-[var(--muted)]">Sin score</div>
                        )}
                      </div>
                      {p.explain ? (
                        <MatchScoreInfoButton
                          explainJson={null}
                          liveExplain={p.explain}
                          className="mt-1 shrink-0 self-start"
                        />
                      ) : null}
                    </label>
                  );
                })}
              </div>
              <Button type="submit" size="sm" variant="secondary" className="shrink-0">
                Guardar vínculos y recalcular matching
              </Button>
            </form>
          ) : null}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="text-lg font-medium">Propiedades</h2>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-medium tracking-[0.14em]">
            <button
              type="button"
              onClick={() => setPropertiesTab("active")}
              className={cn(
                "jif-caps border-0 bg-transparent p-0 text-left transition-colors",
                propertiesTab === "active"
                  ? "text-[var(--jif-gold)]"
                  : "jif-dim hover:text-[var(--foreground)]",
              )}
            >
              Activas ({linksActive.length})
            </button>
            <span className="jif-caps select-none text-[var(--muted)]">|</span>
            <button
              type="button"
              onClick={() => linksArchived.length > 0 && setPropertiesTab("archived")}
              disabled={linksArchived.length === 0}
              className={cn(
                "jif-caps border-0 bg-transparent p-0 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-35",
                propertiesTab === "archived"
                  ? "text-[var(--jif-gold)]"
                  : linksArchived.length > 0
                    ? "jif-dim hover:text-[var(--foreground)]"
                    : "jif-dim",
              )}
            >
              Archivadas ({linksArchived.length})
            </button>
          </p>
          <div className="mt-4 space-y-4">
            {visiblePropertyLinks.map((l) => {
              const series = seriesByProp[l.property_id];
              const listingPrices =
                series?.prices
                  .filter((p) => p.kind === "LISTING_PUBLIC")
                  .map((r) => ({ effective_at: r.effective_at, amount: r.amount })) ?? [];
              const offerPrices =
                series?.prices
                  .filter((p) => p.kind === "OFFER_OPPORTUNITY")
                  .map((r) => ({ effective_at: r.effective_at, amount: r.amount })) ?? [];
              const chartAppr = series?.appraisals ?? [];
              const propOffers = offers.filter((o) => o.property_id === l.property_id);
              const linkStatus = l.link_status ?? "PROPOSED";
              const listingRows = (series?.prices ?? []).filter((p) => p.kind === "LISTING_PUBLIC");
              const latestListingRow = [...listingRows].sort(
                (a, b) => new Date(b.effective_at).getTime() - new Date(a.effective_at).getTime(),
              )[0];
              const latestApprRow = [...chartAppr].sort(
                (a, b) => new Date(b.appraised_at).getTime() - new Date(a.appraised_at).getTime(),
              )[0];
              const offersByDate = [...propOffers].sort(
                (a, b) => new Date(b.offered_at).getTime() - new Date(a.offered_at).getTime(),
              );
              const lastOffer = offersByDate[0];
              const expanded = cardOpen[l.property_id] ?? false;

              const listingSummary =
                latestListingRow != null
                  ? `${latestListingRow.currency} ${Number(latestListingRow.amount).toLocaleString()}`
                  : "—";
              const apprSummary =
                latestApprRow != null
                  ? `${latestApprRow.currency} ${Number(latestApprRow.amount).toLocaleString()}`
                  : "—";
              const offerSummary =
                lastOffer != null
                  ? `${lastOffer.currency} ${Number(lastOffer.amount).toLocaleString()}`
                  : "—";
              const offerStatusSummary =
                lastOffer != null ? OFFER_IN_OPP_STATUS_LABEL[lastOffer.status] : "Sin oferta";

              const listingAmt = latestListingRow != null ? Number(latestListingRow.amount) : null;
              const apprAmt = latestApprRow != null ? Number(latestApprRow.amount) : null;
              const offerNarrative =
                lastOffer == null
                  ? "No hay ofertas registradas para esta propiedad en esta oportunidad."
                  : (() => {
                      const o = Number(lastOffer.amount);
                      const bits: string[] = [
                        `La última oferta es ${lastOffer.currency} ${o.toLocaleString()} (${OFFER_IN_OPP_STATUS_LABEL[lastOffer.status]}).`,
                      ];
                      if (listingAmt != null && Number.isFinite(listingAmt)) {
                        if (o > listingAmt) bits.push(`Supera el precio público vigente (${listingAmt.toLocaleString()}).`);
                        else if (o < listingAmt) bits.push(`Queda por debajo del precio público vigente (${listingAmt.toLocaleString()}).`);
                        else bits.push("Se alinea con el precio público vigente.");
                      }
                      if (apprAmt != null && Number.isFinite(apprAmt)) {
                        if (o > apprAmt) bits.push(`Supera la última tasación (${apprAmt.toLocaleString()}).`);
                        else if (o < apprAmt) bits.push(`Queda por debajo de la última tasación (${apprAmt.toLocaleString()}).`);
                        else bits.push("Se alinea con la última tasación.");
                      }
                      return bits.join(" ");
                    })();
              const chartCurrency =
                latestListingRow?.currency ?? lastOffer?.currency ?? chartAppr[0]?.currency ?? "USD";

              return (
                <div
                  key={l.property_id}
                  className={cn(
                    "overflow-hidden rounded-xl border border-[var(--border)] bg-[#fffcf7]/40",
                    l.archived_at && "opacity-90 ring-1 ring-stone-300/40",
                  )}
                >
                  <div className="flex items-start gap-2 p-4 transition-colors hover:bg-[#fffcf7]/80">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`opp-prop-panel-${l.property_id}`}
                      onClick={() =>
                        setCardOpen((prev) => ({
                          ...prev,
                          [l.property_id]: !(prev[l.property_id] ?? false),
                        }))
                      }
                      className="-m-1 shrink-0 rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--border)]/40 hover:text-[var(--foreground)]"
                    >
                      <ChevronDown className={cn("size-5 transition-transform", expanded && "rotate-180")} aria-hidden />
                    </button>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1">
                          <Link
                            to={`/dashboard/properties/${l.property_id}`}
                            className="font-medium text-[var(--accent)] hover:underline"
                          >
                            {l.Property?.title ?? "Propiedad"}
                          </Link>
                          <span className="text-sm text-[var(--muted)]">
                            ({l.Property ? PROPERTY_KIND_LABEL[l.Property.kind] : ""})
                          </span>
                          {l.archived_at ? (
                            <span className="text-[10px] font-medium uppercase tracking-wide text-amber-800">Archivada</span>
                          ) : null}
                          {l.match_score != null ? (
                            <span className="font-mono text-xs text-[var(--accent)]">Score {l.match_score.toFixed(1)}</span>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <MatchScoreInfoButton explainJson={l.match_explain_json} className="size-8" />
                          {canEdit && !l.archived_at ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="inline-flex size-8 shrink-0 items-center justify-center p-0 text-[var(--muted)] hover:bg-stone-900/5 hover:text-[var(--foreground)]"
                              title="Archivar"
                              aria-label="Archivar propiedad en esta oportunidad"
                              onClick={() => void setLinkArchived(l.property_id, true)}
                            >
                              <Archive className="size-4" strokeWidth={1.75} />
                            </Button>
                          ) : null}
                          {canEdit && l.archived_at ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="inline-flex size-8 shrink-0 items-center justify-center p-0 text-[var(--jif-gold)] hover:bg-stone-900/5 hover:text-[var(--foreground)]"
                              title="Reactivar"
                              aria-label="Reactivar propiedad en esta oportunidad"
                              onClick={() => void setLinkArchived(l.property_id, false)}
                            >
                              <ArchiveRestore className="size-4" strokeWidth={1.75} />
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-5">
                        <div>
                          <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Precio público</dt>
                          <dd className="mt-0.5 font-mono tabular-nums text-[var(--foreground)]">{listingSummary}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Tasación</dt>
                          <dd className="mt-0.5 font-mono tabular-nums text-[var(--foreground)]">{apprSummary}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Última oferta</dt>
                          <dd className="mt-0.5 font-mono tabular-nums text-[var(--foreground)]">{offerSummary}</dd>
                        </div>
                        <div className="min-w-[7rem]">
                          <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Estado oferta</dt>
                          <dd className="mt-0.5 text-[var(--foreground)]">
                            {canEdit && lastOffer ? (
                              <select
                                value={lastOffer.status}
                                onChange={(e) =>
                                  void updateOfferStatus(lastOffer.id, e.target.value as OfferInOpportunityStatus)
                                }
                                className="h-8 w-full max-w-[11rem] rounded border border-[var(--border)] bg-[#fffcf7] px-1 text-[11px]"
                              >
                                {(Object.keys(OFFER_IN_OPP_STATUS_LABEL) as OfferInOpportunityStatus[]).map((k) => (
                                  <option key={k} value={k}>
                                    {OFFER_IN_OPP_STATUS_LABEL[k]}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              offerStatusSummary
                            )}
                          </dd>
                        </div>
                        <div className="col-span-2 min-w-[8rem] sm:col-span-1 lg:col-span-1">
                          <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Estado oportunidad</dt>
                          <dd className="mt-0.5 text-[var(--foreground)]">
                            {canEdit && !l.archived_at ? (
                              <select
                                value={linkStatus}
                                onChange={(e) => void updateLinkStatus(l.property_id, e.target.value as OppPropertyLinkStatus)}
                                className="h-8 w-full max-w-[14rem] rounded border border-[var(--border)] bg-[#fffcf7] px-1 text-[11px]"
                              >
                                {(Object.keys(OPP_PROPERTY_LINK_STATUS_LABEL) as OppPropertyLinkStatus[]).map((k) => (
                                  <option key={k} value={k}>
                                    {OPP_PROPERTY_LINK_STATUS_LABEL[k]}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              OPP_PROPERTY_LINK_STATUS_LABEL[linkStatus]
                            )}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>

                  {expanded ? (
                    <div
                      id={`opp-prop-panel-${l.property_id}`}
                      className="space-y-4 border-t border-[var(--border)] bg-[var(--card)]/60 p-4"
                    >
                      <div className="min-w-0 w-full max-w-full">
                        <PropertyPriceAppraisalChart
                          listingPrices={listingPrices}
                          offerPrices={offerPrices}
                          appraisals={chartAppr}
                          currency={chartCurrency}
                        />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-[var(--muted)]">Última oferta y referencias</p>
                        <p className="mt-1 text-sm leading-relaxed text-[var(--foreground)]">{offerNarrative}</p>
                      </div>

                      <div className="border-t border-[var(--border)] pt-4">
                        <p className="text-sm font-medium">Historial de ofertas</p>
                        {propOffers.length === 0 ? (
                          <p className="mt-1 text-xs text-[var(--muted)]">Sin ofertas cargadas.</p>
                        ) : (
                          <ul className="mt-2 space-y-2 text-xs">
                            {propOffers.map((o) => (
                              <li
                                key={o.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)]/80 bg-[var(--card)] px-2 py-1.5"
                              >
                                <span>
                                  {o.currency} {Number(o.amount).toLocaleString()} ·{" "}
                                  {new Date(o.offered_at).toLocaleDateString()}
                                </span>
                                {canEdit ? (
                                  <select
                                    value={o.status}
                                    onChange={(e) => void updateOfferStatus(o.id, e.target.value as OfferInOpportunityStatus)}
                                    className="h-8 rounded border border-[var(--border)] bg-[#fffcf7] px-1 text-[11px]"
                                  >
                                    {(Object.keys(OFFER_IN_OPP_STATUS_LABEL) as OfferInOpportunityStatus[]).map((k) => (
                                      <option key={k} value={k}>
                                        {OFFER_IN_OPP_STATUS_LABEL[k]}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span>{OFFER_IN_OPP_STATUS_LABEL[o.status]}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {canEdit ? (
                          <div className="mt-4 border-t border-[var(--border)] pt-4">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={offerSavingFor === l.property_id}
                              onClick={() => setOfferModalPropertyId(l.property_id)}
                            >
                              Registrar oferta
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {visiblePropertyLinks.length === 0 ? (
              <p className="border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">
                {propertiesTab === "active"
                  ? "No hay propiedades activas en esta oportunidad."
                  : "No hay propiedades archivadas."}
              </p>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Actividades</h2>
            {canEdit ? (
              <Button type="button" size="sm" onClick={openNewActivityModal}>
                Nueva actividad
              </Button>
            ) : null}
          </div>
          <ul className="mt-4 space-y-3 text-sm">
            {sortedActivities.length === 0 ? (
              <li className="text-[var(--muted)]">Sin actividades registradas.</li>
            ) : (
              sortedActivities.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] pb-3 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-[var(--foreground)]">{activityTypeLabel(a.type)}</span>
                    {a.title ? <span className="text-[var(--foreground)]"> — {a.title}</span> : null}
                    {a.property_id ? (
                      <span className="mt-0.5 block text-xs text-[var(--accent)]">
                        Propiedad:{" "}
                        {links.find((l) => l.property_id === a.property_id)?.Property?.title ??
                          "Ya no vinculada a la oportunidad"}
                      </span>
                    ) : null}
                    {a.due_at ? (
                      <span className="block text-xs text-[var(--muted)]">{new Date(a.due_at).toLocaleString()}</span>
                    ) : null}
                    {a.notes ? <p className="mt-1 text-[var(--muted)]">{a.notes}</p> : null}
                  </div>
                  {canEdit ? (
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="rounded-md p-2 text-[var(--accent)] hover:bg-stone-900/5"
                        title="Editar"
                        aria-label="Editar actividad"
                        onClick={() => openEditActivityModal(a)}
                      >
                        <Pencil className="size-4" strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        className="rounded-md p-2 text-red-700 hover:bg-red-50"
                        title="Eliminar"
                        aria-label="Eliminar actividad"
                        onClick={() => void deleteActivity(a)}
                      >
                        <Trash2 className="size-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>

        <Modal
          open={offerModalPropertyId !== null}
          title="Registrar oferta"
          panelClassName="max-w-lg"
          onClose={() => {
            if (offerSavingFor && offerSavingFor === offerModalPropertyId) return;
            setOfferModalPropertyId(null);
          }}
          footer={
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  if (offerSavingFor && offerSavingFor === offerModalPropertyId) return;
                  setOfferModalPropertyId(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                form="opp-offer-modal-form"
                disabled={Boolean(
                  offerModalPropertyId !== null &&
                    offerSavingFor !== null &&
                    offerSavingFor === offerModalPropertyId,
                )}
              >
                {offerModalPropertyId !== null &&
                offerSavingFor !== null &&
                offerSavingFor === offerModalPropertyId
                  ? "Guardando…"
                  : "Registrar"}
              </Button>
            </>
          }
        >
          {offerModalPropertyId ? (
            <form
              key={offerModalPropertyId}
              id="opp-offer-modal-form"
              className="space-y-4"
              onSubmit={(e) => void submitOffer(e, offerModalPropertyId)}
            >
              {links.find((x) => x.property_id === offerModalPropertyId)?.Property?.title ? (
                <p className="text-sm text-[var(--muted)]">
                  {links.find((x) => x.property_id === offerModalPropertyId)?.Property?.title}
                </p>
              ) : null}
              <PropertyAmountDateFormFields
                variant="offer"
                amountInputId="offer-modal-amount"
                currencyInputId="offer-modal-currency"
                dateInputId="offer-modal-date"
                noteInputId="offer-modal-notes"
                dateFieldName="offered_date"
                noteFieldName="notes"
                dateLabel="Fecha de la oferta"
                defaultDate={todayDateInputValue()}
              />
            </form>
          ) : null}
        </Modal>

        <Modal
          open={activityModalOpen}
          title={editingActivity ? "Editar actividad" : "Nueva actividad"}
          onClose={() => {
            setActivityModalOpen(false);
            setEditingActivity(null);
          }}
          footer={
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setActivityModalOpen(false);
                  setEditingActivity(null);
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" form="activity-modal-form" disabled={activitySaving}>
                {activitySaving ? "Guardando…" : editingActivity ? "Guardar" : "Agregar"}
              </Button>
            </>
          }
        >
          <form
            id="activity-modal-form"
            key={editingActivity?.id ?? "new"}
            onSubmit={(e) => void saveActivityFromModal(e)}
            className="grid gap-3"
          >
            <div>
              <Label htmlFor="act-type">Tipo</Label>
              <select
                id="act-type"
                name="type"
                defaultValue={editingActivity?.type ?? "NOTE"}
                className="mt-1 flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
              >
                {(Object.keys(ACTIVITY_TYPE_LABEL) as ActivityType[])
                  .slice()
                  .sort((a, b) => ACTIVITY_TYPE_LABEL[a].localeCompare(ACTIVITY_TYPE_LABEL[b], "es"))
                  .map((t) => (
                    <option key={t} value={t}>
                      {ACTIVITY_TYPE_LABEL[t]}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <Label htmlFor="act-title">Título</Label>
              <Input id="act-title" name="title" placeholder="Opcional" defaultValue={editingActivity?.title ?? ""} />
            </div>
            <div>
              <Label htmlFor="act-property">Propiedad (opcional)</Label>
              {editingActivity?.property_id &&
              !links.some((l) => l.property_id === editingActivity.property_id) ? (
                <p className="mt-1 rounded-md border border-amber-200/80 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-950">
                  Esta actividad apuntaba a una propiedad que ya no está vinculada. Elegí otra propiedad o ninguna y guardá.
                </p>
              ) : null}
              <select
                id="act-property"
                name="property_id"
                defaultValue={
                  editingActivity?.property_id &&
                  links.some((l) => l.property_id === editingActivity.property_id)
                    ? editingActivity.property_id
                    : ""
                }
                className="mt-1 flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
              >
                <option value="">— Ninguna —</option>
                {links.map((l) => (
                  <option key={l.property_id} value={l.property_id}>
                    {l.Property?.title ?? l.property_id}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                Útil para visitas u otros hitos asociados a un inmueble concreto de esta oportunidad.
              </p>
            </div>
            <div>
              <Label>Vencimiento / recordatorio</Label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="act-due-date" className="text-xs text-[var(--muted)]">
                    Fecha
                  </Label>
                  <Input
                    id="act-due-date"
                    name="due_date"
                    type="date"
                    className="mt-0.5"
                    defaultValue={isoToDateAndTime(editingActivity?.due_at).date}
                  />
                </div>
                <div>
                  <Label htmlFor="act-due-time" className="text-xs text-[var(--muted)]">
                    Hora
                  </Label>
                  <select
                    id="act-due-time"
                    name="due_time"
                    defaultValue={isoToDateAndTime(editingActivity?.due_at).time}
                    className="mt-0.5 flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm tabular-nums"
                  >
                    {TIME_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="act-notes">Notas</Label>
              <Textarea id="act-notes" name="notes" rows={3} placeholder="Detalle" defaultValue={editingActivity?.notes ?? ""} />
            </div>
          </form>
        </Modal>
      </div>
    </RequirePermission>
  );
}

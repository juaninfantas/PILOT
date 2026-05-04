import { useEffect, useState } from "react";
import { BuyerCriteriaBuilder } from "../../components/people/BuyerCriteriaBuilder";
import { parseBuyerExtraJson, serializeBuyerCriteriaRows } from "../../lib/buyer-extra";
import type { BuyerCriteriaRow } from "../../lib/buyer-criteria-fields";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { hasPermission } from "../../lib/permissions";
import { RequirePermission } from "../../components/RequirePermission";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { recomputeMatchingForPerson } from "../../lib/recompute-matching";
import {
  formatPersonProfileLabel,
  isPropertyLinkedProfileSlug,
  PERSON_PROFILE_OPTIONS,
  personProfileUsesCompanyField,
} from "../../lib/person-profiles";
import type { Database } from "../../types/database";

type Person = Database["public"]["Tables"]["Person"]["Row"];
type Pref = Database["public"]["Tables"]["PersonPreference"]["Row"];

export function PersonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { permissions } = useAuth();
  const canEdit = hasPermission(permissions, "manage_people");
  const [person, setPerson] = useState<Person | null>(null);
  const [pref, setPref] = useState<Pref | null>(null);
  const [profiles, setProfiles] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [buyerRows, setBuyerRows] = useState<BuyerCriteriaRow[]>([]);
  const [profileSaving, setProfileSaving] = useState(false);
  const [criteriaSaving, setCriteriaSaving] = useState(false);
  const [personFormKey, setPersonFormKey] = useState(0);
  const [buyerCriteriaFormKey, setBuyerCriteriaFormKey] = useState(0);

  async function load() {
    if (!id) return;
    const { data: p } = await supabase.from("Person").select("*").eq("id", id).maybeSingle();
    setPerson(p as Person);
    const { data: pr } = await supabase.from("PersonPreference").select("*").eq("person_id", id).maybeSingle();
    setPref(pr as Pref);
    const { data: pf } = await supabase.from("PersonProfile").select("profile").eq("person_id", id);
    setProfiles((pf as { profile: string }[])?.map((x) => x.profile) ?? []);
  }

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    setBuyerRows(parseBuyerExtraJson(pref?.buyer_extra_json ?? null).rows);
  }, [pref?.buyer_extra_json]);

  function toggleStandardProfile(slug: string) {
    setProfiles((prev) => {
      const pinned = prev.filter(isPropertyLinkedProfileSlug);
      const swing = prev.filter((p) => !isPropertyLinkedProfileSlug(p));
      const next = swing.includes(slug) ? swing.filter((x) => x !== slug) : [...swing, slug];
      return [...pinned, ...next];
    });
  }

  /** Perfiles de rol en propiedad (no editables desde este módulo). */
  const propertyProfiles = profiles.filter(isPropertyLinkedProfileSlug);

  const showAddress = profiles.some((p) => ["contacto", "interesado", "tasador", "informador", "referral"].includes(p));
  const showClientIds = profiles.includes("cliente");
  const showCompany = profiles.some(personProfileUsesCompanyField);

  const showBuyerScoring = profiles.includes("interesado");

  async function saveProfiles() {
    if (!id || profileSaving) return;
    setProfileSaving(true);
    const { data: existingRows, error: fetchErr } = await supabase
      .from("PersonProfile")
      .select("profile")
      .eq("person_id", id);
    if (fetchErr) {
      setMsg(fetchErr.message);
      setProfileSaving(false);
      return;
    }
    const existingSet = new Set((existingRows as { profile: string }[]).map((r) => r.profile));
    const desiredStandard = profiles.filter((p) => !isPropertyLinkedProfileSlug(p));
    const desiredStandardSet = new Set(desiredStandard);
    const existingStandard = [...existingSet].filter((p) => !isPropertyLinkedProfileSlug(p));
    const toRemove = existingStandard.filter((p) => !desiredStandardSet.has(p));
    const toAdd = desiredStandard.filter((p) => !existingSet.has(p));

    if (toRemove.length) {
      const { error: delErr } = await supabase.from("PersonProfile").delete().eq("person_id", id).in("profile", toRemove);
      if (delErr) {
        setMsg(delErr.message);
        setProfileSaving(false);
        return;
      }
    }
    if (toAdd.length) {
      const { error: insErr } = await supabase
        .from("PersonProfile")
        .insert(toAdd.map((profile) => ({ person_id: id, profile })));
      if (insErr) {
        setMsg(insErr.message);
        setProfileSaving(false);
        return;
      }
    }

    if (!profiles.includes("interesado")) {
      await supabase.from("PersonPreference").update({ buyer_extra_json: null }).eq("person_id", id);
      setBuyerRows([]);
    }

    const r = await recomputeMatchingForPerson(id);
    setProfileSaving(false);
    setMsg(r.error ? `Perfiles guardados; matching: ${r.error}` : "Perfiles actualizados.");
    void load();
    setBuyerCriteriaFormKey((k) => k + 1);
  }

  async function savePerson(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!id || !person) return;
    const fd = new FormData(e.currentTarget);

    const company = showCompany ? String(fd.get("company") ?? "").trim() || null : person.company;
    const address_line = showAddress ? String(fd.get("address_line") ?? "").trim() || null : person.address_line;
    const tax_id = showClientIds ? String(fd.get("tax_id") ?? "").trim() || null : person.tax_id;
    const trade_name = showClientIds ? String(fd.get("trade_name") ?? "").trim() || null : person.trade_name;

    const { error } = await supabase
      .from("Person")
      .update({
        name: String(fd.get("name") ?? "").trim(),
        email: String(fd.get("email") ?? "").trim() || null,
        phone: String(fd.get("phone") ?? "").trim() || null,
        company,
        notes: String(fd.get("notes") ?? "").trim() || null,
        address_line,
        tax_id,
        trade_name,
      })
      .eq("id", id);
    if (error) setMsg(error.message);
    else {
      setMsg("Persona actualizada.");
      void load();
      setPersonFormKey((k) => k + 1);
    }
  }

  async function deletePerson() {
    if (!id || !canEdit) return;
    if (!window.confirm("¿Eliminar esta persona? Se eliminan perfiles, preferencias y oportunidades vinculadas (cascada).")) return;
    const { error } = await supabase.from("Person").delete().eq("id", id);
    if (error) setMsg(error.message);
    else nav("/dashboard/people");
  }

  async function saveBuyerCriteria(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!id || !profiles.includes("interesado") || criteriaSaving) return;
    setCriteriaSaving(true);
    const buyerSerialized = serializeBuyerCriteriaRows(buyerRows) || null;
    const { error } = await supabase.from("PersonPreference").upsert(
      {
        person_id: id,
        buyer_extra_json: buyerSerialized,
        zones_json: null,
        min_m2: null,
        max_price: null,
        price_currency: "USD",
        property_kinds_json: null,
        feature_tags_json: null,
      },
      { onConflict: "person_id" },
    );
    setCriteriaSaving(false);
    if (error) setMsg(error.message);
    else {
      setMsg("Criterios guardados.");
      const r = await recomputeMatchingForPerson(id);
      if (r.error) setMsg(`Criterios ok; matching: ${r.error}`);
      void load();
      setBuyerCriteriaFormKey((k) => k + 1);
    }
  }

  if (!id) return null;

  return (
    <RequirePermission slug="view_people">
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-[var(--muted)]">
              <Link to="/dashboard/people" className="text-[var(--accent)] hover:underline">
                Personas
              </Link>{" "}
              / {person?.name ?? "…"}
            </p>
            <h1 className="text-2xl font-semibold">{person?.name ?? "Persona"}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && person ? (
              <Button type="button" variant="danger" onClick={() => void deletePerson()}>
                Eliminar
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={() => nav(-1)}>
              Volver
            </Button>
          </div>
        </div>
        {msg ? <p className="text-[var(--accent)]">{msg}</p> : null}

        {!canEdit && person ? (
          <div className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
            <h2 className="text-lg font-medium">Datos</h2>
            <dl className="grid gap-3 text-sm md:grid-cols-2">
              <div>
                <dt className="text-[var(--muted)]">Email</dt>
                <dd>{person.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Teléfono</dt>
                <dd>{person.phone ?? "—"}</dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-[var(--muted)]">Empresa</dt>
                <dd>{person.company ?? "—"}</dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-[var(--muted)]">Dirección</dt>
                <dd>{person.address_line ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">DNI / CUIT</dt>
                <dd>{person.tax_id ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Nombre fantasía</dt>
                <dd>{person.trade_name ?? "—"}</dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-[var(--muted)]">Notas</dt>
                <dd className="whitespace-pre-wrap text-[var(--muted)]">{person.notes ?? "—"}</dd>
              </div>
            </dl>
            <div className="border-t border-[var(--border)] pt-4">
              <h3 className="text-sm font-medium text-[var(--foreground)]">Perfiles</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">
                {profiles.map(formatPersonProfileLabel).join(", ") || "—"}
              </p>
            </div>
          </div>
        ) : null}

        {canEdit && person ? (
          <form
            key={`person-datos-${person.id}-${person.updated_at}-${personFormKey}`}
            onSubmit={(e) => void savePerson(e)}
            className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
          >
            <h2 className="text-lg font-medium">Datos de contacto</h2>
            <div className="grid gap-4 md:grid-cols-12">
              <div className="md:col-span-8">
                <Label htmlFor="name">Nombre *</Label>
                <Input id="name" name="name" defaultValue={person.name} required className="mt-1" />
              </div>
              <div className="md:col-span-4" />
              <div className="md:col-span-6">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" defaultValue={person.email ?? ""} className="mt-1" />
              </div>
              <div className="md:col-span-6">
                <Label htmlFor="phone">Teléfono</Label>
                <Input id="phone" name="phone" defaultValue={person.phone ?? ""} className="mt-1" />
              </div>
              {showCompany ? (
                <div className="md:col-span-12">
                  <Label htmlFor="company">Empresa / inmobiliaria</Label>
                  <Input
                    id="company"
                    name="company"
                    defaultValue={person.company ?? ""}
                    className="mt-1"
                    placeholder="Razón social o nombre comercial"
                  />
                </div>
              ) : null}
              {showAddress ? (
                <div className="md:col-span-12">
                  <Label htmlFor="address_line">Dirección (libre)</Label>
                  <Input id="address_line" name="address_line" defaultValue={person.address_line ?? ""} className="mt-1" />
                </div>
              ) : null}
              {showClientIds ? (
                <>
                  <div className="md:col-span-6">
                    <Label htmlFor="tax_id">DNI / CUIT</Label>
                    <Input id="tax_id" name="tax_id" defaultValue={person.tax_id ?? ""} className="mt-1" />
                  </div>
                  <div className="md:col-span-6">
                    <Label htmlFor="trade_name">Nombre fantasía</Label>
                    <Input id="trade_name" name="trade_name" defaultValue={person.trade_name ?? ""} className="mt-1" />
                  </div>
                </>
              ) : null}
              <div className="md:col-span-12">
                <Label htmlFor="notes">Notas</Label>
                <Textarea id="notes" name="notes" rows={4} defaultValue={person.notes ?? ""} className="mt-1" />
              </div>
            </div>
            <div className="flex justify-end border-t border-[var(--border)] pt-4">
              <Button type="submit">Guardar datos</Button>
            </div>
          </form>
        ) : null}

        {canEdit && person ? (
          <div className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
            <div>
              <h2 className="text-lg font-medium">Perfiles</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Los roles marcados desde la ficha de una propiedad (dueño/a, familiar, tutor/responsable o inmobiliaria/martillero) se muestran abajo como referencia:
                modificá esa vinculación desde la pestaña Contacto de la propiedad.
              </p>
            </div>
            {propertyProfiles.length ? (
              <div>
                <p className="text-xs font-medium text-[var(--muted)]">Rol respecto de propiedad</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {propertyProfiles.map((p) => (
                    <span
                      key={p}
                      className="rounded-full border border-[var(--border)] bg-[#fffcf7] px-3 py-1.5 text-xs text-[var(--foreground)]"
                    >
                      {formatPersonProfileLabel(p)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            <div>
              <p className="mb-2 text-xs text-[var(--muted)]">
                Roles generales CRM (activá cómo en el alta). Guardá para aplicar cambios y recalcular matching.
              </p>
              <div className="flex flex-wrap gap-2">
                {PERSON_PROFILE_OPTIONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => toggleStandardProfile(p)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      profiles.includes(p)
                        ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--foreground)]"
                        : "border-[var(--border)] bg-[#fffcf7] text-[var(--muted)] hover:border-[var(--accent)]/40"
                    }`}
                  >
                    {formatPersonProfileLabel(p)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end border-t border-[var(--border)] pt-4">
              <Button type="button" variant="secondary" disabled={profileSaving} onClick={() => void saveProfiles()}>
                {profileSaving ? "Guardando…" : "Guardar perfiles"}
              </Button>
            </div>
          </div>
        ) : null}

        {canEdit && person && showBuyerScoring ? (
          <form
            key={`person-buyer-${id}-${buyerCriteriaFormKey}`}
            onSubmit={(e) => void saveBuyerCriteria(e)}
            className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
          >
            <BuyerCriteriaBuilder rows={buyerRows} onChange={setBuyerRows} />
            <div className="flex justify-end border-t border-[var(--border)] pt-4">
              <Button type="submit" disabled={criteriaSaving}>
                {criteriaSaving ? "Guardando…" : "Guardar criterios y recalcular matching"}
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </RequirePermission>
  );
}

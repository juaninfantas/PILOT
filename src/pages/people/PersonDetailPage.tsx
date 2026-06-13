import { useEffect, useMemo, useState } from "react";
import { BuyerCriteriaBuilder } from "../../components/people/BuyerCriteriaBuilder";
import { parseBuyerExtraJson, serializeBuyerCriteriaRows } from "../../lib/buyer-extra";
import type { BuyerCriteriaRow } from "../../lib/buyer-criteria-fields";
import { ExternalLink } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useCurrencyCatalog } from "../../contexts/CurrencyCatalogContext";
import { useAuth } from "../../contexts/AuthContext";
import { hasPermission } from "../../lib/permissions";
import { RequirePermission } from "../../components/RequirePermission";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Tabs } from "../../components/ui/tabs";
import { recomputeMatchingForPerson } from "../../lib/recompute-matching";
import {
  formatPersonProfileLabel,
  isPropertyLinkedProfileSlug,
  PERSON_PROFILE_OPTIONS,
  personProfileUsesCompanyField,
} from "../../lib/person-profiles";
import type { Database } from "../../types/database";
import { CurrencySelect } from "../../components/ui/currency-select";
import { normalizeCurrencyCode } from "../../lib/currencies";

type Person = Database["public"]["Tables"]["Person"]["Row"];
type Pref = Database["public"]["Tables"]["PersonPreference"]["Row"];
type OrgUserOption = Pick<Database["public"]["Tables"]["User"]["Row"], "id" | "name" | "email">;
type ContactRow = Database["public"]["Tables"]["PropertyPersonContact"]["Row"];

type PropertySnippet = { id: string; title: string; city_zone: string | null };

type PropertyLinkRow = ContactRow & { Property: PropertySnippet | PropertySnippet[] | null };

const PERSON_TABS = [
  { id: "general", label: "General" },
  { id: "propiedades", label: "Propiedades" },
];

const PROFILE_SLUGS_WITH_ADDRESS = ["contacto", "interesado", "tasador", "informador", "agente", "referral"];

function unwrapProperty(embed: PropertySnippet | PropertySnippet[] | null): PropertySnippet | null {
  if (!embed) return null;
  return Array.isArray(embed) ? embed[0] ?? null : embed;
}

function propertyPersonContactRoleLabel(
  row: Pick<ContactRow, "is_owner" | "is_family" | "family_relation" | "is_guardian" | "is_broker">,
): string {
  if (row.is_broker) return "Inmobiliaria / martillero";
  if (row.is_owner && !row.is_family && !row.is_guardian) return "Dueño/a";
  if (!row.is_owner && row.is_family && !row.is_guardian) {
    return row.family_relation?.trim() ? `Familiar (${row.family_relation.trim()})` : "Familiar";
  }
  if (!row.is_owner && !row.is_family && row.is_guardian) return "Tutor/responsable";
  if (row.is_owner) return "Dueño/a";
  if (row.is_family) return row.family_relation?.trim() ? `Familiar (${row.family_relation.trim()})` : "Familiar";
  if (row.is_guardian) return "Tutor/responsable";
  return "—";
}

export function PersonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { codeSet } = useCurrencyCatalog();
  const { permissions } = useAuth();
  const canEdit = hasPermission(permissions, "manage_people");
  const canManageUsers = hasPermission(permissions, "manage_users");
  const [personTab, setPersonTab] = useState("general");
  const [person, setPerson] = useState<Person | null>(null);
  const [pref, setPref] = useState<Pref | null>(null);
  const [profiles, setProfiles] = useState<string[]>([]);
  const [propertyLinks, setPropertyLinks] = useState<PropertyLinkRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [buyerRows, setBuyerRows] = useState<BuyerCriteriaRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [personFormKey, setPersonFormKey] = useState(0);
  const [buyerCriteriaFormKey, setBuyerCriteriaFormKey] = useState(0);
  const [orgUsers, setOrgUsers] = useState<OrgUserOption[]>([]);
  const [linkedUserRow, setLinkedUserRow] = useState<OrgUserOption | null>(null);

  function sortOrgUsers(users: OrgUserOption[]): OrgUserOption[] {
    return [...users].sort((a, b) => {
      const la = (a.name ?? a.email ?? "").toLocaleLowerCase("es");
      const lb = (b.name ?? b.email ?? "").toLocaleLowerCase("es");
      const c = la.localeCompare(lb, "es");
      if (c !== 0) return c;
      return (a.email ?? "").localeCompare(b.email ?? "", "es");
    });
  }

  async function load() {
    if (!id) return;
    const personId = id;
    const [pRes, prRes, pfRes, pcRes] = await Promise.all([
      supabase.from("Person").select("*").eq("id", personId).maybeSingle(),
      supabase.from("PersonPreference").select("*").eq("person_id", personId).maybeSingle(),
      supabase.from("PersonProfile").select("profile").eq("person_id", personId),
      supabase
        .from("PropertyPersonContact")
        .select("id, property_id, person_id, is_owner, is_family, family_relation, is_guardian, is_broker, Property(id, title, city_zone)")
        .eq("person_id", personId)
        .order("created_at", { ascending: true }),
    ]);

    const loadedPerson = (pRes.data as Person) ?? null;
    setPerson(loadedPerson);
    setPref(prRes.data as Pref);
    const rawProfiles = ((pfRes.data as { profile: string }[]) ?? []).map((x) => x.profile);
    setProfiles(rawProfiles.map((slug) => (slug === "referral" ? "agente" : slug)));

    if (pcRes.error) {
      const { data: contacts } = await supabase.from("PropertyPersonContact").select("*").eq("person_id", personId).order("created_at", {
        ascending: true,
      });
      if (contacts?.length) {
        const propIds = [...new Set((contacts as ContactRow[]).map((c) => c.property_id))];
        const { data: props } = await supabase.from("Property").select("id, title, city_zone").in("id", propIds);
        const byId = Object.fromEntries(((props ?? []) as PropertySnippet[]).map((x) => [x.id, x]));
        setPropertyLinks(
          (contacts as ContactRow[]).map((c) => ({
            ...c,
            Property: byId[c.property_id] ?? null,
          })) as PropertyLinkRow[],
        );
      } else setPropertyLinks([]);
    } else {
      setPropertyLinks(((pcRes.data as PropertyLinkRow[]) ?? []) as PropertyLinkRow[]);
    }

    const orgId = loadedPerson?.organization_id;
    const linkedId = loadedPerson?.linked_user_id;

    let resolvedLinked: OrgUserOption | null = null;
    if (!linkedId) {
      setLinkedUserRow(null);
    } else {
      const { data: u } = await supabase.from("User").select("id, name, email").eq("id", linkedId).maybeSingle();
      resolvedLinked = (u as OrgUserOption) ?? null;
      setLinkedUserRow(resolvedLinked);
    }

    if (!canManageUsers || !orgId) {
      setOrgUsers([]);
    } else {
      const { data: mem } = await supabase
        .from("OrganizationMembership")
        .select("user_id")
        .eq("organization_id", orgId)
        .eq("is_active", true);
      const userIds = [...new Set((mem ?? []).map((m) => (m as { user_id: string }).user_id))];
      const { data: users } = userIds.length
        ? await supabase.from("User").select("id, name, email").in("id", userIds)
        : { data: [] as OrgUserOption[] };
      let list = sortOrgUsers((users as OrgUserOption[]) ?? []);
      if (resolvedLinked?.id && !list.some((u) => u.id === resolvedLinked.id)) {
        list = sortOrgUsers([...list, resolvedLinked]);
      }
      setOrgUsers(list);
    }
  }

  useEffect(() => {
    void load();
  }, [id, canManageUsers]);

  useEffect(() => {
    setBuyerRows(parseBuyerExtraJson(pref?.buyer_extra_json ?? null).rows);
  }, [pref?.buyer_extra_json]);

  const sortedPropertyLinks = useMemo(() => {
    return [...propertyLinks].sort((a, b) => {
      const ta = unwrapProperty(a.Property)?.title ?? "";
      const tb = unwrapProperty(b.Property)?.title ?? "";
      return ta.localeCompare(tb, "es");
    });
  }, [propertyLinks]);

  function toggleStandardProfile(slug: string) {
    setProfiles((prev) => {
      const pinned = prev.filter(isPropertyLinkedProfileSlug);
      const swing = prev.filter((p) => !isPropertyLinkedProfileSlug(p));
      const next = swing.includes(slug) ? swing.filter((x) => x !== slug) : [...swing, slug];
      return [...pinned, ...next];
    });
  }

  const showAddress = profiles.some((p) => PROFILE_SLUGS_WITH_ADDRESS.includes(p));
  const showClientIds = profiles.includes("cliente");
  const showCompany = profiles.some(personProfileUsesCompanyField);
  const showBuyerScoring = profiles.includes("interesado");
  const canLinkUser = profiles.some((p) => p === "agente" || p === "referral");

  async function saveAll(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!id || !person || saving) return;
    setSaving(true);
    setMsg(null);
    const fd = new FormData(e.currentTarget);

    const company = showCompany ? String(fd.get("company") ?? "").trim() || null : person.company;
    const address_line = showAddress ? String(fd.get("address_line") ?? "").trim() || null : person.address_line;
    const tax_id = showClientIds ? String(fd.get("tax_id") ?? "").trim() || null : person.tax_id;
    const trade_name = showClientIds ? String(fd.get("trade_name") ?? "").trim() || null : person.trade_name;
    const linkedRaw = String(fd.get("linked_user_id") ?? "").trim();
    const linked_user_id = linkedRaw === "" ? null : linkedRaw;

    const { error: personErr } = await supabase
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

    if (personErr) {
      setMsg(personErr.message);
      setSaving(false);
      return;
    }

    const { data: existingRows, error: fetchErr } = await supabase.from("PersonProfile").select("profile").eq("person_id", id);
    if (fetchErr) {
      setMsg(fetchErr.message);
      setSaving(false);
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
        setSaving(false);
        return;
      }
    }
    if (toAdd.length) {
      const { error: insErr } = await supabase
        .from("PersonProfile")
        .insert(toAdd.map((profile) => ({ person_id: id, profile })));
      if (insErr) {
        setMsg(insErr.message);
        setSaving(false);
        return;
      }
    }

    const hasAgentProfile = profiles.some((p) => p === "agente" || p === "referral");
    const linkChanged = linked_user_id !== (person.linked_user_id ?? null);

    if (linkChanged && canManageUsers) {
      if (linked_user_id && !hasAgentProfile) {
        setMsg("Para vincular un usuario, la persona debe tener perfil Agente.");
        setSaving(false);
        return;
      }
      const { error: linkErr } = await supabase.rpc("link_org_person_to_user", {
        p_person_id: id,
        p_user_id: linked_user_id,
      });
      if (linkErr) {
        setMsg(linkErr.message);
        setSaving(false);
        return;
      }
    }

    if (!profiles.includes("interesado")) {
      await supabase
        .from("PersonPreference")
        .update({ buyer_extra_json: null, min_price: null, max_price: null })
        .eq("person_id", id);
      setBuyerRows([]);
    } else {
      const buyerSerialized = serializeBuyerCriteriaRows(buyerRows) || null;
      const minP = String(fd.get("buyer_min_price") ?? "").trim() || null;
      const maxP = String(fd.get("buyer_max_price") ?? "").trim() || null;
      const priceCur = normalizeCurrencyCode(String(fd.get("buyer_price_currency") ?? pref?.price_currency ?? "USD"), codeSet);
      const { error: prefErr } = await supabase.from("PersonPreference").upsert(
        {
          person_id: id,
          buyer_extra_json: buyerSerialized,
          zones_json: pref?.zones_json ?? null,
          min_m2: pref?.min_m2 ?? null,
          min_price: minP,
          max_price: maxP,
          price_currency: priceCur,
          property_kinds_json: pref?.property_kinds_json ?? null,
          feature_tags_json: pref?.feature_tags_json ?? null,
        },
        { onConflict: "person_id" },
      );
      if (prefErr) {
        setMsg(prefErr.message);
        setSaving(false);
        return;
      }
    }

    const r = await recomputeMatchingForPerson(id);
    setSaving(false);
    setMsg(r.error ? `Cambios guardados; matching: ${r.error}` : "Cambios guardados.");
    void load();
    setPersonFormKey((k) => k + 1);
    setBuyerCriteriaFormKey((k) => k + 1);
  }

  async function deletePerson() {
    if (!id || !canEdit) return;
    if (!window.confirm("¿Eliminar esta persona? Se eliminan perfiles, preferencias y oportunidades vinculadas (cascada).")) return;
    const { error } = await supabase.from("Person").delete().eq("id", id);
    if (error) setMsg(error.message);
    else nav("/dashboard/people");
  }

  if (!id) return null;

  const linkedPropertiesInset =
    sortedPropertyLinks.length === 0 ? null : (
      <div className="rounded-lg border border-[var(--border)] bg-[#fffcf7]/60 p-4">
        <h3 className="text-sm font-medium text-[var(--foreground)]">Propiedades vinculadas</h3>
        <p className="mt-0.5 text-xs text-[var(--muted)]">Abrí la ficha desde Contacto en cada propiedad.</p>
        <ul className="mt-2 space-y-1.5">
          {sortedPropertyLinks.map((row) => {
            const prop = unwrapProperty(row.Property);
            const label = prop?.title?.trim() || "Ir a propiedad";
            const sub = [prop?.city_zone, propertyPersonContactRoleLabel(row)].filter(Boolean).join(" · ");
            return (
              <li key={row.id}>
                <Link
                  to={`/dashboard/properties/${row.property_id}`}
                  className="inline-flex flex-wrap items-center gap-1 text-sm font-medium text-[var(--accent)] hover:underline"
                >
                  {label}
                  <ExternalLink className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />
                </Link>
                {sub ? <p className="text-xs text-[var(--muted)]">{sub}</p> : null}
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => setPersonTab("propiedades")}
          className="mt-3 text-xs font-medium text-[var(--accent)] underline-offset-4 hover:underline"
        >
          Ver en tabla (pestaña Propiedades)
        </button>
      </div>
    );

  const propiedadesPanel = (
    <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
      <h2 className="text-lg font-medium">Propiedades</h2>
      <p className="text-xs text-[var(--muted)]">
        Personas vinculadas desde la pestaña Contacto de cada propiedad (dueño/a, familiar, tutor o inmobiliaria).
      </p>
      {sortedPropertyLinks.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No está asignada a ninguna propiedad como contacto.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                <th className="pb-2 pr-3 font-medium">Propiedad</th>
                <th className="pb-2 pr-3 font-medium">Ubicación</th>
                <th className="pb-2 font-medium">Rol</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {sortedPropertyLinks.map((row) => {
                const prop = unwrapProperty(row.Property);
                const title = prop?.title?.trim() || "Ver propiedad";
                return (
                  <tr key={row.id}>
                    <td className="py-2 pr-3">
                      <Link
                        to={`/dashboard/properties/${row.property_id}`}
                        className="inline-flex items-center gap-1 font-medium text-[var(--accent)] hover:underline"
                      >
                        {title}
                        <ExternalLink className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-[var(--muted)]">{prop?.city_zone ?? "—"}</td>
                    <td className="py-2 text-[var(--foreground)]">{propertyPersonContactRoleLabel(row)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <RequirePermission slug="view_people">
      <div className="space-y-6">
        <div>
          <p className="text-sm text-[var(--muted)]">
            <Link to="/dashboard/people" className="text-[var(--accent)] hover:underline">
              Personas
            </Link>{" "}
            / {person?.name ?? "…"}
          </p>
          <h1 className="text-2xl font-semibold">{person?.name ?? "Persona"}</h1>
        </div>

        {msg ? <p className="text-[var(--accent)]">{msg}</p> : null}

        <Tabs tabs={[...PERSON_TABS]} active={personTab} onChange={setPersonTab} />

        {personTab === "propiedades" ? propiedadesPanel : null}

        {personTab === "general" && !canEdit && person ? (
          <div className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
            <h2 className="text-lg font-medium">General</h2>
            <dl className="grid gap-3 text-sm md:grid-cols-2">
              <div className="md:col-span-2">
                <dt className="text-[var(--muted)]">Vinculación</dt>
                <dd>
                  {linkedUserRow ? (
                    <>
                      {linkedUserRow.name?.trim() || linkedUserRow.email?.trim() || linkedUserRow.id}
                      {linkedUserRow.name?.trim() && linkedUserRow.email?.trim()
                        ? ` · ${linkedUserRow.email}`
                        : null}
                    </>
                  ) : person.linked_user_id ? (
                    <span className="text-[var(--muted)]">{person.linked_user_id}</span>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
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
            {linkedPropertiesInset ? <div className="mt-4">{linkedPropertiesInset}</div> : null}
            <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
              <Button type="button" variant="ghost" onClick={() => nav(-1)}>
                Volver
              </Button>
            </div>
          </div>
        ) : null}

        {personTab === "general" && canEdit && person ? (
          <form
            key={`person-all-${person.id}-${person.updated_at}-${personFormKey}`}
            onSubmit={(e) => void saveAll(e)}
            className="space-y-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
          >
            <div>
              <h3 className="text-base font-medium">Perfiles</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Elegí primero los roles; los campos de abajo se adaptan. Los roles vinculados a una propiedad se gestionan desde la
                ficha del inmueble.
              </p>
              <div className="mt-4">
                <p className="mb-2 text-xs text-[var(--muted)]">Roles generales CRM</p>
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
            </div>

            <h2 className="text-lg font-medium">General</h2>

            <div className="grid gap-4 md:grid-cols-12 md:items-start">
              <div className="flex flex-col md:col-span-6">
                <Label htmlFor="name">Nombre *</Label>
                <Input id="name" name="name" defaultValue={person.name} required className="mt-1" />
              </div>
              {canManageUsers ? (
              <div className="flex flex-col md:col-span-6">
                <Label htmlFor="linked_user_id">Vinculación (usuario Pilot)</Label>
                <select
                  id="linked_user_id"
                  name="linked_user_id"
                  defaultValue={person.linked_user_id ?? ""}
                  disabled={!canLinkUser}
                  className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm text-[var(--foreground)] disabled:opacity-60"
                >
                  <option value="">Sin vincular</option>
                  {orgUsers.map((u) => {
                    const primary = u.name?.trim() || u.email?.trim() || u.id;
                    const suffix = u.name?.trim() && u.email?.trim() ? ` (${u.email})` : "";
                    return (
                      <option key={u.id} value={u.id}>
                        {primary}
                        {suffix}
                      </option>
                    );
                  })}
                </select>
                {!canLinkUser ? (
                  <p className="mt-1 text-xs text-[var(--muted)]">Agregá el perfil Agente para vincular una cuenta de acceso.</p>
                ) : (
                  <p className="mt-1 text-xs text-[var(--muted)]">Un usuario por persona agente en la inmobiliaria.</p>
                )}
              </div>
              ) : null}
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

            {linkedPropertiesInset ? <div className="mt-2">{linkedPropertiesInset}</div> : null}

            {showBuyerScoring ? (
              <div key={`person-buyer-${id}-${buyerCriteriaFormKey}`} className="border-t border-[var(--border)] pt-5">
                <h3 className="mb-3 text-base font-medium">Criterios de comprador</h3>
                <div className="mb-4 rounded-lg border border-[var(--border)] bg-[#fffcf7]/60 p-4">
                  <p className="text-sm font-medium text-[var(--foreground)]">Rango de precio (scoring)</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Dejá vacío un extremo si no aplica. El score de precio usa el precio público vigente de cada propiedad.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label htmlFor="buyer_min_price" className="text-xs text-[var(--muted)]">
                        Mínimo
                      </Label>
                      <Input
                        id="buyer_min_price"
                        name="buyer_min_price"
                        type="number"
                        step="any"
                        min={0}
                        placeholder="Opcional"
                        className="mt-1"
                        defaultValue={pref?.min_price ?? ""}
                      />
                    </div>
                    <div>
                      <Label htmlFor="buyer_max_price" className="text-xs text-[var(--muted)]">
                        Máximo
                      </Label>
                      <Input
                        id="buyer_max_price"
                        name="buyer_max_price"
                        type="number"
                        step="any"
                        min={0}
                        placeholder="Opcional"
                        className="mt-1"
                        defaultValue={pref?.max_price ?? ""}
                      />
                    </div>
                    <div>
                      <Label htmlFor="buyer_price_currency" className="text-xs text-[var(--muted)]">
                        Moneda
                      </Label>
                      <CurrencySelect
                        id="buyer_price_currency"
                        name="buyer_price_currency"
                        defaultValue={pref?.price_currency ?? "USD"}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>
                <BuyerCriteriaBuilder rows={buyerRows} onChange={setBuyerRows} />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="ghost" onClick={() => nav(-1)}>
                  Volver
                </Button>
                <Button type="button" variant="danger" onClick={() => void deletePerson()}>
                  Eliminar
                </Button>
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </form>
        ) : null}

        {personTab === "general" && !person ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted)]">Cargando…</div>
        ) : null}
      </div>
    </RequirePermission>
  );
}

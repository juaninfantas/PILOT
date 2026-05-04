import { useState } from "react";
import { BuyerCriteriaBuilder } from "../../components/people/BuyerCriteriaBuilder";
import { serializeBuyerCriteriaRows } from "../../lib/buyer-extra";
import type { BuyerCriteriaRow } from "../../lib/buyer-criteria-fields";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useActiveOrganization } from "../../contexts/OrganizationContext";
import { RequirePermission } from "../../components/RequirePermission";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { formatPersonProfileLabel, PERSON_PROFILE_OPTIONS, personProfileUsesCompanyField } from "../../lib/person-profiles";

export function PersonNewPage() {
  const org = useActiveOrganization();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [buyerRows, setBuyerRows] = useState<BuyerCriteriaRow[]>([]);

  function toggleProfile(p: string) {
    setProfiles((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  const showAddress = profiles.some((p) => ["contacto", "interesado", "tasador", "informador", "referral"].includes(p));
  const showClientIds = profiles.includes("cliente");
  const showCompany = profiles.some(personProfileUsesCompanyField);
  const showBuyerExtra = profiles.includes("interesado");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    if (!name) {
      setError("Nombre obligatorio");
      return;
    }
    setPending(true);
    const { data: person, error: pe } = await supabase
      .from("Person")
      .insert({
        organization_id: org.id,
        name,
        email: String(fd.get("email") ?? "").trim() || null,
        phone: String(fd.get("phone") ?? "").trim() || null,
        company: showCompany ? String(fd.get("company") ?? "").trim() || null : null,
        notes: String(fd.get("notes") ?? "").trim() || null,
        address_line: String(fd.get("address_line") ?? "").trim() || null,
        tax_id: String(fd.get("tax_id") ?? "").trim() || null,
        trade_name: String(fd.get("trade_name") ?? "").trim() || null,
      })
      .select("id")
      .single();
    if (pe || !person) {
      setError(pe?.message ?? "Error");
      setPending(false);
      return;
    }
    if (profiles.length) {
      await supabase.from("PersonProfile").insert(profiles.map((p) => ({ person_id: person.id, profile: p })));
    }
    await supabase.from("PersonPreference").insert({
      person_id: person.id,
      buyer_extra_json: showBuyerExtra ? serializeBuyerCriteriaRows(buyerRows) || null : null,
    });
    setPending(false);
    nav(`/dashboard/people/${person.id}`);
  }

  return (
    <RequirePermission slug="manage_people">
      <div className="mx-auto max-w-3xl space-y-6 px-1 sm:px-0">
        <h1 className="text-2xl font-semibold">Nueva persona</h1>
        <form onSubmit={onSubmit} className="space-y-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 md:p-8">
          <div className="grid gap-4 md:grid-cols-2 md:gap-x-6 md:gap-y-4">
            <div className="md:col-span-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input id="name" name="name" required className="mt-1" />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" name="phone" className="mt-1" />
            </div>
            {showCompany ? (
              <div className="md:col-span-2">
                <Label htmlFor="company">Empresa / inmobiliaria</Label>
                <Input id="company" name="company" className="mt-1" placeholder="Razón social o nombre comercial" />
              </div>
            ) : null}
            {showAddress ? (
              <div className="md:col-span-2">
                <Label htmlFor="address_line">Dirección (libre)</Label>
                <Input id="address_line" name="address_line" placeholder="Calle, barrio, ciudad…" className="mt-1" />
              </div>
            ) : null}
            {showClientIds ? (
              <>
                <div>
                  <Label htmlFor="tax_id">DNI / CUIT</Label>
                  <Input id="tax_id" name="tax_id" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="trade_name">Nombre fantasía</Label>
                  <Input id="trade_name" name="trade_name" className="mt-1" />
                </div>
              </>
            ) : null}
          </div>

          <div>
            <Label>Perfiles</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {PERSON_PROFILE_OPTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => toggleProfile(p)}
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

          {showBuyerExtra ? <BuyerCriteriaBuilder rows={buyerRows} onChange={setBuyerRows} /> : null}

          <div>
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" rows={4} className="mt-1" />
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => nav("/dashboard/people")}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creando…" : "Crear"}
            </Button>
          </div>
        </form>
      </div>
    </RequirePermission>
  );
}

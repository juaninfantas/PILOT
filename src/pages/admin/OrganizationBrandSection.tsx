import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useOrganization } from "../../contexts/OrganizationContext";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

export function OrganizationBrandSection() {
  const { organization, refresh } = useOrganization();
  const [displayName, setDisplayName] = useState("");
  const [fiscalLegalName, setFiscalLegalName] = useState("");
  const [fiscalAddress, setFiscalAddress] = useState("");
  const [fiscalCuit, setFiscalCuit] = useState("");
  const [fiscalIva, setFiscalIva] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [brokerMatricula, setBrokerMatricula] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!organization) return;
    setDisplayName(organization.display_name);
    setLogoUrl(organization.logo_url);
    setFiscalLegalName(organization.fiscal_legal_name ?? "");
    setFiscalAddress(organization.fiscal_address ?? "");
    setFiscalCuit(organization.fiscal_cuit ?? "");
    setFiscalIva(organization.fiscal_iva_condition ?? "");
    setContactPhone(organization.contact_phone ?? "");
    setBrokerMatricula(organization.broker_matricula ?? "");
    setLogoFile(null);
  }, [organization]);

  useEffect(() => {
    if (!logoFile) {
      setPreviewObjectUrl(null);
      return;
    }
    const u = URL.createObjectURL(logoFile);
    setPreviewObjectUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [logoFile]);

  const previewSrc = previewObjectUrl ?? logoUrl;

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!organization) return;
    setMsg(null);
    setPending(true);
    let nextLogo = (logoUrl ?? "").trim();
    if (logoFile) {
      const safe = logoFile.name.replace(/[^\w.-]+/g, "_");
      const path = `${organization.id}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from("organization-logos").upload(path, logoFile, { upsert: false });
      if (upErr) {
        setMsg(upErr.message);
        setPending(false);
        return;
      }
      const { data } = supabase.storage.from("organization-logos").getPublicUrl(path);
      nextLogo = data.publicUrl;
    }
    const { error } = await supabase.rpc("update_my_organization_profile", {
      p_display_name: displayName.trim(),
      p_logo_url: nextLogo,
      p_fiscal_legal_name: fiscalLegalName.trim(),
      p_fiscal_address: fiscalAddress.trim(),
      p_fiscal_cuit: fiscalCuit.trim(),
      p_fiscal_iva_condition: fiscalIva.trim(),
      p_contact_phone: contactPhone.trim(),
      p_broker_matricula: brokerMatricula.trim(),
    });
    setPending(false);
    if (error) setMsg(error.message);
    else {
      setMsg("Datos guardados.");
      setLogoFile(null);
      await refresh();
    }
  }

  if (!organization) {
    return <p className="text-sm text-[var(--muted)]">Cargando datos de la inmobiliaria…</p>;
  }

  return (
    <div id="organization" className="scroll-mt-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold">Inmobiliaria</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Identificador técnico (slug):{" "}
            <span className="font-mono text-[var(--foreground)]">{organization.slug}</span>
          </p>
        </div>
        <Button
          type="submit"
          form="org-brand-form"
          disabled={pending}
          className="jif-btn-primary inline-flex h-10 min-w-10 shrink-0 items-center justify-center px-3"
          aria-label="Guardar"
          title="Guardar"
        >
          {pending ? <Loader2 className="size-5 shrink-0 animate-spin" /> : <Save className="size-5 shrink-0" />}
        </Button>
      </div>

      <form id="org-brand-form" onSubmit={(e) => void onSave(e)} className="max-w-xl space-y-5">
        {msg ? <p className="text-sm text-[var(--accent)]">{msg}</p> : null}

        <div className="space-y-2">
          <Label htmlFor="org-display-name">Nombre comercial</Label>
          <Input id="org-display-name" value={displayName} onChange={(ev) => setDisplayName(ev.target.value)} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="org-logo">Logo</Label>
          <input
            id="org-logo"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/svg+xml"
            className="text-sm text-[var(--foreground)] file:mr-3 file:border-0 file:bg-[var(--secondary)] file:px-3 file:py-1.5"
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              setLogoFile(f ?? null);
              setMsg(null);
            }}
          />
          {previewSrc ? <img src={previewSrc} alt="" className="mt-2 max-h-28 max-w-full object-contain" /> : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="org-contact-phone">Teléfono de contacto</Label>
            <Input
              id="org-contact-phone"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="Ej. +54 249 444-0000"
            />
            <p className="text-xs text-[var(--muted)]">Aparece en la ficha pública y en el PDF de compartir propiedad.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-matricula">Número de matrícula</Label>
            <Input
              id="org-matricula"
              value={brokerMatricula}
              onChange={(e) => setBrokerMatricula(e.target.value)}
              placeholder="Registro profesional / matrícula"
            />
            <p className="text-xs text-[var(--muted)]">Membrete del PDF (inmobiliaria).</p>
          </div>
        </div>

        <div className="border-t border-[var(--border)] pt-5">
          <h3 className="text-base font-semibold text-[var(--foreground)]">Información fiscal</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">Datos para facturación y documentación.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="fiscal-legal-name">Razón social / nombre fiscal</Label>
              <Input
                id="fiscal-legal-name"
                value={fiscalLegalName}
                onChange={(e) => setFiscalLegalName(e.target.value)}
                placeholder="Ej. Pilot SA"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="fiscal-address">Domicilio fiscal</Label>
              <Input
                id="fiscal-address"
                value={fiscalAddress}
                onChange={(e) => setFiscalAddress(e.target.value)}
                placeholder="Calle, ciudad, CP"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fiscal-cuit">CUIT / ID fiscal</Label>
              <Input id="fiscal-cuit" value={fiscalCuit} onChange={(e) => setFiscalCuit(e.target.value)} placeholder="XX-XXXXXXXX-X" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fiscal-iva">Condición IVA</Label>
              <Input
                id="fiscal-iva"
                value={fiscalIva}
                onChange={(e) => setFiscalIva(e.target.value)}
                placeholder="Ej. Responsable inscripto"
              />
            </div>
          </div>
        </div>

      </form>
    </div>
  );
}

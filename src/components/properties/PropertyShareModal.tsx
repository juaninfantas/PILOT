import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button } from "../ui/button";
import { Modal } from "../ui/modal";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import type { PublicPropertyPdfInput } from "../../lib/property-public-pdf";
import type { PropertyShareFormatRow } from "../../lib/property-share-visibility";
import {
  buildSharePlainText,
  pickDefaultShareFormatId,
  visibilityFromFormatRow,
} from "../../lib/property-share-visibility";
import { useActiveOrganization } from "../../contexts/OrganizationContext";
import { Link } from "react-router-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  /** Datos completos para PDF / texto (se aplica el formato elegido). */
  pdfData: PublicPropertyPdfInput | null;
};

export function PropertyShareModal({ open, onClose, propertyId, pdfData }: Props) {
  const org = useActiveOrganization();
  const [formats, setFormats] = useState<PropertyShareFormatRow[]>([]);
  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"copy" | "pdf" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [textCopied, setTextCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFeedback(null);
    setTextCopied(false);
    void (async () => {
      const { data, error } = await supabase
        .from("PropertyShareFormat")
        .select("*")
        .eq("organization_id", org.id)
        .order("name", { ascending: true });
      if (error) {
        console.error(error);
        setFormats([]);
        setSelectedFormatId(null);
        return;
      }
      const list = (data as PropertyShareFormatRow[]) ?? [];
      setFormats(list);
      setSelectedFormatId(pickDefaultShareFormatId(list));
    })();
  }, [open, org.id]);

  const selectedFormat = useMemo(
    () => formats.find((f) => f.id === selectedFormatId) ?? null,
    [formats, selectedFormatId],
  );

  const visibility = useMemo(
    () => (selectedFormat ? visibilityFromFormatRow(selectedFormat) : null),
    [selectedFormat],
  );

  const plainText = useMemo(() => {
    if (!pdfData || !visibility) return "";
    return buildSharePlainText(pdfData, visibility);
  }, [pdfData, visibility]);

  const canAct = Boolean(selectedFormatId && pdfData);

  async function copyLink() {
    if (!canAct || !selectedFormatId) return;
    setFeedback(null);
    setBusy("copy");
    const { data, error } = await supabase.rpc("create_property_public_share", {
      p_property_id: propertyId,
      p_days: 14,
      p_share_format_id: selectedFormatId,
    });
    setBusy(null);
    if (error) {
      setFeedback(error.message);
      return;
    }
    const token = data as string;
    const url = `${window.location.origin}/public/property?t=${encodeURIComponent(token)}`;
    try {
      await navigator.clipboard.writeText(url);
      setFeedback("Enlace copiado al portapapeles (válido 14 días). Compartilo solo con quien corresponda.");
    } catch {
      setFeedback(`No se pudo copiar automáticamente. Copiá manualmente:\n${url}`);
    }
  }

  async function downloadPdf() {
    if (!canAct || !pdfData || !visibility) {
      setFeedback("Elegí un formato de compartir primero.");
      return;
    }
    setFeedback(null);
    setBusy("pdf");
    try {
      const { generatePropertyBrochurePdfBlob } = await import("../../lib/property-public-pdf");
      const blob = await generatePropertyBrochurePdfBlob(pdfData, visibility);
      const name = pdfData.property.title.replace(/[^\w\s-]/g, "").trim().slice(0, 48) || "propiedad";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `ficha-${name}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
      setFeedback("PDF generado.");
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Error al generar PDF");
    }
    setBusy(null);
  }

  async function copyPlainText() {
    if (!plainText.trim()) {
      setFeedback("No hay texto para copiar con este formato.");
      return;
    }
    try {
      await navigator.clipboard.writeText(plainText);
      setTextCopied(true);
      setFeedback("Texto copiado al portapapeles.");
      window.setTimeout(() => setTextCopied(false), 2000);
    } catch {
      setFeedback("No se pudo copiar el texto automáticamente.");
    }
  }

  return (
    <Modal
      open={open}
      title="Compartir propiedad"
      onClose={() => {
        setFeedback(null);
        onClose();
      }}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => { setFeedback(null); onClose(); }}>
            Cerrar
          </Button>
        </>
      }
    >
      <div className="space-y-5 text-sm text-[var(--foreground)]">
        <p className="text-[var(--muted)]">
          Elegí un <strong>formato de compartir</strong> en el desplegable (por defecto viene el marcado en administración, o «Completa»).
          El enlace público, el PDF y el texto de abajo respetan los mismos campos visibles.
        </p>
        <p className="text-xs text-[var(--muted)]">
          <Link to="/dashboard/admin?tab=configuracion#share-formats" className="text-[var(--accent)] hover:underline">
            Gestionar formatos
          </Link>
        </p>

        <div>
          <Label htmlFor="share-format-select" className="text-xs font-medium text-[var(--muted)]">
            Formato
          </Label>
          {formats.length === 0 ? (
            <p className="mt-2 text-sm text-amber-800">
              No hay formatos configurados. Creá al menos uno en Administración → Configuración.
            </p>
          ) : (
            <select
              id="share-format-select"
              className="mt-2 flex h-10 w-full rounded-lg border border-[var(--border)] bg-[#fffcf7] px-3 text-sm"
              value={selectedFormatId ?? ""}
              onChange={(e) => setSelectedFormatId(e.target.value || null)}
            >
              {formats.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" className="flex-1" disabled={busy !== null || !canAct} onClick={() => void copyLink()}>
            {busy === "copy" ? "Generando…" : "Copiar enlace público"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            disabled={busy !== null || !canAct || !pdfData}
            onClick={() => void downloadPdf()}
          >
            {busy === "pdf" ? "Generando…" : "Descargar PDF"}
          </Button>
        </div>

        <div className="space-y-2 border-t border-[var(--border)] pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-xs font-medium text-[var(--muted)]">Solo texto (WhatsApp, mail…)</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs"
              disabled={!canAct || !plainText.trim()}
              onClick={() => void copyPlainText()}
            >
              <Copy className="size-3.5" />
              {textCopied ? "Copiado" : "Copiar todo"}
            </Button>
          </div>
          <Textarea
            readOnly
            value={plainText || (canAct ? "" : "Elegí un formato para ver el texto generado.")}
            rows={10}
            className="font-mono text-xs leading-relaxed"
          />
        </div>

        {!pdfData ? (
          <p className="text-xs text-[var(--muted)]">El PDF requiere datos de la propiedad cargados en la ficha.</p>
        ) : null}

        {feedback ? <p className="whitespace-pre-wrap text-xs text-[var(--accent)]">{feedback}</p> : null}
      </div>
    </Modal>
  );
}

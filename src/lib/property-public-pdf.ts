import { jsPDF } from "jspdf";
import type { ListingStatus } from "../types/database";
import { LISTING_STATUS_LABEL } from "./property-listing-status";
import { PROPERTY_KIND_LABEL } from "./property-options";
import { supabase } from "./supabase";
import type { PropertyShareVisibility } from "./property-share-visibility";
import { anyCommercialSpecVisible, FULL_SHARE_VISIBILITY } from "./property-share-visibility";

const BG: [number, number, number] = [252, 249, 242];
const NAVY: [number, number, number] = [26, 43, 72];
const MUTED: [number, number, number] = [112, 112, 112];

export type OrgHeader = {
  display_name: string;
  logo_url: string | null;
  /** Domicilio fiscal u oficina (membrete). */
  fiscal_address: string | null;
  contact_phone: string | null;
  broker_matricula: string | null;
};

export type PublicPropertyPdfInput = {
  organization: OrgHeader;
  property: {
    title: string;
    city_zone: string;
    address: string | null;
    kind: keyof typeof PROPERTY_KIND_LABEL;
    covered_m2: number | null;
    total_m2: number | null;
    rooms: number | null;
    bathrooms: number | null;
    parking: number | null;
    condition: string | null;
    listing_status: ListingStatus;
    description: string | null;
    amenity_tags: string | null;
    is_exclusive: boolean;
    has_quincho?: boolean;
    has_pool?: boolean;
    floor_count?: number | null;
    has_patio?: boolean;
    has_terrace?: boolean;
    has_laundry?: boolean;
    has_balcony?: boolean;
    has_garden?: boolean;
    has_service_room?: boolean;
    has_elevator?: boolean;
    geo_unit_id?: string | null;
    /** Precalculado en cliente con `geo_unit_path_labeled` cuando aplica. */
    geo_path_labeled?: string | null;
    lat?: number | null;
    lng?: number | null;
  };
  public_price: { amount: string; currency: string } | null;
  /** URLs públicas de fotos (cover primero). Máx. ~12 en el PDF. */
  photo_urls?: string[];
};

const MAX_PHOTOS_IN_PDF = 12;
const IMG_MAX_PX = 1200;

function ensureRoom(doc: jsPDF, y: number, margin: number, need: number): number {
  const maxY = doc.internal.pageSize.getHeight() - margin;
  if (y + need > maxY) {
    doc.addPage();
    paintPageBackground(doc);
    return margin;
  }
  return y;
}

function paintPageBackground(doc: jsPDF) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFillColor(BG[0], BG[1], BG[2]);
  doc.rect(0, 0, pageW, pageH, "F");
}

function dash(s: string | null | undefined): string {
  const t = (s ?? "").trim();
  return t.length ? t : "—";
}

/**
 * Convierte imagen remota a JPEG (data URL) para jsPDF.
 * Rellena el canvas con el fondo de la ficha antes de dibujar: PNG/WebP con transparencia
 * no queda con “fondo negro” al pasar a JPEG (sin canal alfa).
 */
async function imageUrlToJpegDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    const bmp = await createImageBitmap(blob).catch(() => null);
    if (!bmp) return null;
    let w = bmp.width;
    let h = bmp.height;
    if (w > IMG_MAX_PX || h > IMG_MAX_PX) {
      const r = Math.min(IMG_MAX_PX / w, IMG_MAX_PX / h);
      w = Math.round(w * r);
      h = Math.round(h * r);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bmp.close();
      return null;
    }
    ctx.fillStyle = `rgb(${BG[0]}, ${BG[1]}, ${BG[2]})`;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return canvas.toDataURL("image/jpeg", 0.88);
  } catch {
    return null;
  }
}

function drawFieldAt(doc: jsPDF, x: number, topY: number, label: string, value: string, colW: number): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.text(label.toUpperCase(), x, topY);
  let yy = topY + 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  const valueLines = doc.splitTextToSize(value, colW - 2);
  doc.text(valueLines, x, yy);
  yy += valueLines.length * 13;
  return yy + 8;
}

export async function generatePropertyBrochurePdfBlob(
  data: PublicPropertyPdfInput,
  visibility: PropertyShareVisibility = FULL_SHARE_VISIBILITY,
): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const gap = 24;
  const colW = (pageW - margin * 2 - gap) / 2;
  const org = data.organization;
  const pr = data.property;
  const v = visibility;

  paintPageBackground(doc);

  let y = margin;
  const headerStartY = y;
  const logoBox = 56;
  let textX = margin;

  if (v.show_org_logo && org.logo_url?.trim()) {
    const dataUrl = await imageUrlToJpegDataUrl(org.logo_url.trim());
    if (dataUrl) {
      try {
        doc.addImage(dataUrl, "JPEG", margin, y, logoBox, logoBox);
        textX = margin + logoBox + 16;
      } catch {
        textX = margin;
      }
    }
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.text("PROPIEDAD COMPARTIDA", textX, y + 8);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  const orgDisplay = v.show_org_name ? (org.display_name || "Inmobiliaria").trim() : "";
  const nameLines = orgDisplay
    ? doc.splitTextToSize(orgDisplay, pageW - textX - margin)
    : [];
  if (nameLines.length) doc.text(nameLines, textX, y + 28);
  let hy = y + 28 + (nameLines.length ? nameLines.length * 20 : 0);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  const addr = v.show_org_fiscal_address ? (org.fiscal_address ?? "").trim() : "";
  if (addr) {
    const al = doc.splitTextToSize(addr, pageW - textX - margin);
    doc.text(al, textX, hy);
    hy += al.length * 12;
  }
  const phone = v.show_org_contact ? (org.contact_phone ?? "").trim() : "";
  if (phone) {
    doc.text(`Tel.: ${phone}`, textX, hy);
    hy += 12;
  }
  const mat = v.show_org_contact ? (org.broker_matricula ?? "").trim() : "";
  if (mat) {
    doc.text(`Matrícula: ${mat}`, textX, hy);
    hy += 12;
  }

  y = Math.max(hy + 8, headerStartY + logoBox) + 8;
  doc.setDrawColor(220, 215, 205);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 22;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  const titleText = v.show_property_title ? pr.title : "";
  const titleLines = titleText ? doc.splitTextToSize(titleText, pageW - margin * 2) : [];
  if (titleLines.length) {
    y = ensureRoom(doc, y, margin, titleLines.length * 22 + 40);
    doc.text(titleLines, margin, y);
    y += titleLines.length * 22 + 6;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  const locParts: string[] = [];
  if (v.show_city_zone && pr.city_zone?.trim()) locParts.push(pr.city_zone.trim());
  if (v.show_street_address && pr.address?.trim()) locParts.push(pr.address.trim());
  const loc = locParts.join(" · ");
  const locLines = doc.splitTextToSize(loc || "—", pageW - margin * 2);
  doc.text(locLines, margin, y);
  y += locLines.length * 14 + 12;

  let geoLabeled = pr.geo_path_labeled ?? null;
  if (v.show_geo_path && !geoLabeled?.trim() && pr.geo_unit_id) {
    const { data: g } = await supabase.rpc("geo_unit_path_labeled", { p_unit_id: pr.geo_unit_id, p_locale: "es" });
    geoLabeled = typeof g === "string" ? g : null;
  }
  if (v.show_geo_path && geoLabeled?.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    const gl = doc.splitTextToSize(geoLabeled.trim(), pageW - margin * 2);
    doc.text(gl, margin, y);
    y += gl.length * 13 + 8;
  }
  if (v.show_coordinates && pr.lat != null && pr.lng != null) {
    doc.setFontSize(8);
    doc.text(`Coordenadas: ${Number(pr.lat).toFixed(5)}, ${Number(pr.lng).toFixed(5)}`, margin, y);
    y += 14;
  }
  if (v.show_external_map_link && pr.lat != null && pr.lng != null) {
    const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(`${pr.lat},${pr.lng}`)}`;
    doc.setTextColor(80, 100, 140);
    const ul = doc.splitTextToSize(`Mapa: ${mapUrl}`, pageW - margin * 2);
    doc.text(ul, margin, y);
    y += ul.length * 11 + 10;
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  }
  y += 8;

  const priceStr =
    v.show_price && data.public_price
      ? `${data.public_price.currency} ${Number(data.public_price.amount).toLocaleString("es-AR")}`
      : "—";

  const kindLabel = PROPERTY_KIND_LABEL[pr.kind] ?? pr.kind;
  const statusLabel = LISTING_STATUS_LABEL[pr.listing_status] ?? pr.listing_status;

  const leftFields: { label: string; value: string }[] = [];
  if (v.show_spec_kind) leftFields.push({ label: "Tipo", value: kindLabel });
  if (v.show_spec_listing_status) leftFields.push({ label: "Estado comercial", value: statusLabel });
  if (v.show_spec_covered_m2) leftFields.push({ label: "Superficie cubierta", value: pr.covered_m2 != null ? `${pr.covered_m2} m²` : "—" });
  if (v.show_spec_rooms) leftFields.push({ label: "Ambientes", value: pr.rooms != null ? String(pr.rooms) : "—" });
  if (v.show_spec_parking) leftFields.push({ label: "Estacionamiento", value: pr.parking != null ? String(pr.parking) : "—" });
  if (v.show_spec_condition) leftFields.push({ label: "Estado / condición", value: dash(pr.condition) });
  const yn = (b: boolean | undefined) => (b ? "Sí" : "No");
  if (v.show_spec_quincho) leftFields.push({ label: "Quincho", value: yn(pr.has_quincho) });
  if (v.show_spec_pool) leftFields.push({ label: "Pileta", value: yn(pr.has_pool) });
  if (v.show_spec_floor_count) leftFields.push({ label: "Plantas", value: pr.floor_count != null ? String(pr.floor_count) : "—" });
  if (v.show_spec_patio) leftFields.push({ label: "Patio", value: yn(pr.has_patio) });
  if (v.show_spec_terrace) leftFields.push({ label: "Terraza", value: yn(pr.has_terrace) });
  if (v.show_spec_laundry) leftFields.push({ label: "Lavadero indep.", value: yn(pr.has_laundry) });
  if (v.show_spec_balcony) leftFields.push({ label: "Balcón", value: yn(pr.has_balcony) });
  if (v.show_spec_garden) leftFields.push({ label: "Jardín / parque", value: yn(pr.has_garden) });
  if (v.show_spec_service_room) leftFields.push({ label: "Dependencia", value: yn(pr.has_service_room) });
  if (v.show_spec_elevator) leftFields.push({ label: "Ascensor", value: yn(pr.has_elevator) });
  if (v.show_spec_amenities) leftFields.push({ label: "Etiquetas", value: dash(pr.amenity_tags) });

  const rightFields: { label: string; value: string }[] = [];
  if (v.show_price) rightFields.push({ label: "Precio público", value: priceStr });
  if (v.show_spec_exclusive) rightFields.push({ label: "Exclusiva", value: pr.is_exclusive ? "Sí" : "No" });
  if (v.show_spec_total_m2) rightFields.push({ label: "Superficie total", value: pr.total_m2 != null ? `${pr.total_m2} m²` : "—" });
  if (v.show_spec_bathrooms) rightFields.push({ label: "Baños", value: pr.bathrooms != null ? String(pr.bathrooms) : "—" });

  const maxRows = Math.max(leftFields.length, rightFields.length);
  if (maxRows > 0) {
    for (let i = 0; i < maxRows; i++) {
      y = ensureRoom(doc, y, margin, 80);
      const lf = leftFields[i];
      const rf = rightFields[i];
      const rowTop = y;
      const bottomL = lf ? drawFieldAt(doc, margin, rowTop, lf.label, lf.value, colW) : rowTop;
      const bottomR = rf ? drawFieldAt(doc, margin + colW + gap, rowTop, rf.label, rf.value, colW) : rowTop;
      y = Math.max(bottomL, bottomR);
    }
    y += 6;
  } else if (v.show_price && data.public_price && !anyCommercialSpecVisible(v)) {
    y = ensureRoom(doc, y, margin, 28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.text(priceStr, margin, y);
    y += 28;
  }

  if (v.show_description) {
    y = ensureRoom(doc, y, margin, 36);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text("DESCRIPCIÓN", margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    const desc = (pr.description ?? "").trim();
    const descLines = doc.splitTextToSize(desc.length ? desc : "—", pageW - margin * 2);
    for (const line of descLines) {
      y = ensureRoom(doc, y, margin, 16);
      doc.text(line, margin, y);
      y += 14;
    }
  }

  const urls = v.show_photos
    ? (data.photo_urls ?? []).filter((u) => typeof u === "string" && u.startsWith("http")).slice(0, MAX_PHOTOS_IN_PDF)
    : [];
  if (urls.length) {
    y += 16;
    y = ensureRoom(doc, y, margin, 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text("FOTOGRAFÍAS", margin, y);
    y += 18;

    const thumbW = (pageW - margin * 2 - gap) / 2;
    const thumbH = 140;
    let col = 0;
    for (const url of urls) {
      const dataUrl = await imageUrlToJpegDataUrl(url);
      if (!dataUrl) continue;
      if (col === 0) y = ensureRoom(doc, y, margin, thumbH + 20);
      const xImg = margin + col * (thumbW + gap);
      try {
        doc.addImage(dataUrl, "JPEG", xImg, y, thumbW, thumbH);
      } catch {
        continue;
      }
      if (col === 1) {
        y += thumbH + 16;
        col = 0;
      } else {
        col = 1;
      }
    }
    if (col === 1) y += thumbH + 16;
  }

  return doc.output("blob");
}

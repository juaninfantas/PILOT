import JSZip from "jszip";

export function sanitizeFilenameBase(name: string) {
  return name.replace(/[^\w\s.-]/g, "").replace(/\s+/g, "-").slice(0, 80) || "archivo";
}

function extensionFromUrl(url: string) {
  try {
    const path = new URL(url).pathname;
    const last = path.split("/").pop() ?? "";
    const dot = last.lastIndexOf(".");
    if (dot > 0 && dot < last.length - 1) return last.slice(dot);
  } catch {
    /* ignore */
  }
  return "";
}

function uniqueZipEntryName(desired: string, used: Set<string>) {
  let name = desired;
  let n = 1;
  const dot = desired.lastIndexOf(".");
  const base = dot > 0 ? desired.slice(0, dot) : desired;
  const ext = dot > 0 ? desired.slice(dot) : "";
  while (used.has(name)) {
    name = ext ? `${base}-${n}${ext}` : `${desired}-${n}`;
    n += 1;
  }
  used.add(name);
  return name;
}

/**
 * Descarga un ZIP con archivos obtenidos por URL (p. ej. URLs públicas de Storage).
 */
export async function downloadUrlsAsZip(
  entries: { url: string; label: string | null }[],
  zipDownloadName: string,
): Promise<void> {
  if (!entries.length) return;
  const zip = new JSZip();
  const used = new Set<string>();

  for (let i = 0; i < entries.length; i += 1) {
    const { url, label } = entries[i];
    const fromUrl = extensionFromUrl(url);
    let base: string;
    if (label?.trim()) {
      base = sanitizeFilenameBase(label.trim());
      if (!base.includes(".") && fromUrl) base += fromUrl.startsWith(".") ? fromUrl : `.${fromUrl}`;
    } else {
      const dotExt = fromUrl ? (fromUrl.startsWith(".") ? fromUrl : `.${fromUrl}`) : "";
      base = `archivo-${i + 1}${dotExt}`;
    }
    const name = uniqueZipEntryName(base || `archivo-${i + 1}`, used);

    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(`No se pudo descargar «${name}» (${res.status})`);
    const buf = await res.arrayBuffer();
    zip.file(name, buf);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  const href = URL.createObjectURL(blob);
  a.href = href;
  a.download = zipDownloadName.endsWith(".zip") ? zipDownloadName : `${zipDownloadName}.zip`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

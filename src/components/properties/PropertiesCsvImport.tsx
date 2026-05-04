import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button } from "../ui/button";

/** CSV mínimo: title,city_zone (obligatorios). Columnas opcionales: kind,address,total_m2 */
export function PropertiesCsvImport({ organizationId, onDone }: { organizationId: string; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPending(true);
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      setError("CSV vacío o sin encabezados");
      setPending(false);
      return;
    }
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const ti = header.indexOf("title");
    const ci = header.indexOf("city_zone");
    if (ti < 0 || ci < 0) {
      setError("Faltan columnas title y city_zone en la primera fila");
      setPending(false);
      return;
    }
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id ?? null;
    const rows: { title: string; city_zone: string; kind?: string; address?: string | null; total_m2?: number | null }[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const title = cols[ti];
      const city_zone = cols[ci];
      if (!title || !city_zone) continue;
      const row: (typeof rows)[0] = { title, city_zone };
      const ki = header.indexOf("kind");
      if (ki >= 0 && cols[ki]) row.kind = cols[ki];
      const ai = header.indexOf("address");
      if (ai >= 0 && cols[ai]) row.address = cols[ai];
      const mi = header.indexOf("total_m2");
      if (mi >= 0 && cols[mi]) row.total_m2 = Number(cols[mi]) || null;
      rows.push(row);
    }
    if (!rows.length) {
      setError("No hay filas válidas");
      setPending(false);
      return;
    }
    const { error: ie } = await supabase.from("Property").insert(
      rows.map((r) => ({
        organization_id: organizationId,
        title: r.title,
        city_zone: r.city_zone,
        kind: (r.kind as never) ?? "OTHER",
        address: r.address ?? null,
        total_m2: r.total_m2 ?? null,
        created_by_id: uid,
      })),
    );
    setPending(false);
    if (ie) setError(ie.message);
    else {
      onDone();
      e.target.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => void onFile(e)}
        disabled={pending}
        className="hidden"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        title="Importar propiedades"
        onClick={() => inputRef.current?.click()}
        className="rounded-full border border-[var(--border)]"
      >
        <Upload className="size-4" />
      </Button>
      <span className="text-xs text-[var(--muted)]">{pending ? "Importando propiedades..." : "CSV"}</span>
      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
    </div>
  );
}

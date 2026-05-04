export const MANAGEMENT_CODES = ["VENTA", "ALQUILER", "PERMUTA"] as const;
export type ManagementCode = (typeof MANAGEMENT_CODES)[number];

export const MANAGEMENT_OPTIONS: { value: ManagementCode; label: string }[] = [
  { value: "VENTA", label: "Venta" },
  { value: "ALQUILER", label: "Alquiler" },
  { value: "PERMUTA", label: "Permuta" },
];

const CODE_SET = new Set<string>(MANAGEMENT_CODES);

export function parseManagement(raw: string | null | undefined): ManagementCode[] {
  if (!raw?.trim()) return [];
  const out = new Set<ManagementCode>();
  for (const part of raw.split(",")) {
    const t = part.trim();
    const up = t.toUpperCase();
    if (CODE_SET.has(up)) {
      out.add(up as ManagementCode);
      continue;
    }
    const low = t.toLowerCase();
    if (low === "venta") out.add("VENTA");
    else if (low === "alquiler") out.add("ALQUILER");
    else if (low === "permuta") out.add("PERMUTA");
  }
  return [...out];
}

export function serializeManagement(codes: ManagementCode[]): string {
  return MANAGEMENT_CODES.filter((c) => codes.includes(c)).join(",");
}

export function managementCodesFromForm(values: FormDataEntryValue[]): ManagementCode[] {
  const out: ManagementCode[] = [];
  for (const v of values) {
    if (typeof v !== "string") continue;
    const up = v.trim().toUpperCase();
    if (CODE_SET.has(up)) out.push(up as ManagementCode);
  }
  return [...new Set(out)];
}

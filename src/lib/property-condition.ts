/** Valores canónicos guardados en `Property.condition` (texto libre en BD). */

export const PROPERTY_CONDITION_VALUES = [
  "A estrenar",
  "Obra nueva",
  "En construcción",
  "A reformar",
  "Refaccionado / reciclado",
  "Excelente estado",
  "Muy buen estado",
  "Buen estado",
  "Estado regular",
] as const;

export type PropertyConditionPreset = (typeof PROPERTY_CONDITION_VALUES)[number];

export function propertyConditionSelectOptions(stored: string | null): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [
    { value: "", label: "Sin especificar" },
    ...PROPERTY_CONDITION_VALUES.map((v) => ({ value: v, label: v })),
  ];
  const s = stored?.trim() ?? "";
  if (s && !opts.some((o) => o.value === s)) {
    opts.push({ value: s, label: s });
  }
  return opts;
}

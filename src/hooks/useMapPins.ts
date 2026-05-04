import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { PROPERTY_KIND_LABEL } from "../lib/property-options";
import type { MapPin } from "../components/map/PropertyMap";
import type { Database } from "../types/database";

type Property = Database["public"]["Tables"]["Property"]["Row"];
type PriceRow = Database["public"]["Tables"]["PropertyPrice"]["Row"];

export function useMapPins() {
  const [pins, setPins] = useState<MapPin[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { data: plist } = await supabase.from("Property").select("*");
      if (cancelled) return;
      const list = (plist as Property[])?.filter((p) => p.lat != null && p.lng != null) ?? [];
      const ids = list.map((p) => p.id);
      const byProp: Record<string, PriceRow[]> = {};
      if (ids.length) {
        const { data: prs } = await supabase
          .from("PropertyPrice")
          .select("property_id, amount, currency, kind, effective_at")
          .in("property_id", ids)
          .eq("kind", "LISTING_PUBLIC")
          .order("effective_at", { ascending: false });
        if (cancelled) return;
        for (const row of (prs as PriceRow[]) ?? []) {
          if (!byProp[row.property_id]) byProp[row.property_id] = [];
          if (byProp[row.property_id].length < 1) byProp[row.property_id].push(row);
        }
      }

      const next: MapPin[] = list.map((p) => {
        const pr = byProp[p.id]?.[0];
        return {
          id: p.id,
          title: p.title,
          city_zone: p.city_zone,
          lat: p.lat!,
          lng: p.lng!,
          priceLabel: pr ? `${pr.currency} ${Number(pr.amount).toLocaleString()}` : "—",
          kindLabel: PROPERTY_KIND_LABEL[p.kind],
        };
      });
      setPins(next);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { pins, loading };
}

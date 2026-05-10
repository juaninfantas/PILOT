import "leaflet/dist/leaflet.css";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { cn } from "../../lib/utils";

export type MapPin = {
  id: string;
  title: string;
  city_zone: string;
  lat: number;
  lng: number;
  priceLabel: string;
  kindLabel: string;
};

type PropertyMapProps = { pins: MapPin[]; className?: string };

type InteractiveLocation = { lat: number; lng: number };

type PropertyMapInteractiveProps = PropertyMapProps & {
  onPickLocation?: (loc: InteractiveLocation) => void;
  draggableSinglePin?: boolean;
};

function MapClickHandler({ onPickLocation }: { onPickLocation?: (loc: InteractiveLocation) => void }) {
  useMapEvents({
    click(e) {
      onPickLocation?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export function PropertyMap({ pins, className, onPickLocation, draggableSinglePin = false }: PropertyMapInteractiveProps) {
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const activePin = useMemo(() => pins.find((p) => p.id === activePinId) ?? null, [activePinId, pins]);
  const markerIcon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: '<div style="width:14px;height:14px;background:#1a2d4a;border:2px solid #f2ebe1;border-radius:9999px;box-shadow:0 1px 2px rgba(26,45,74,0.35);"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      }),
    [],
  );

  const center: { lat: number; lng: number } = pins[0]
    ? { lat: pins[0].lat, lng: pins[0].lng }
    : { lat: -34.6, lng: -58.38 };

  return (
    <MapContainer
      className={cn(
        "z-0 h-[min(70vh,560px)] w-full rounded-xl border-2 border-[var(--border)]",
        className,
      )}
      center={center}
      zoom={pins.length > 1 ? 11 : 12}
    >
      <MapClickHandler onPickLocation={onPickLocation} />
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {pins.map((p) => (
        <Marker
          key={p.id}
          position={{ lat: p.lat, lng: p.lng }}
          icon={markerIcon}
          draggable={draggableSinglePin && pins.length === 1}
          eventHandlers={{
            click: () => setActivePinId(p.id),
            dragend: (e) => {
              if (!draggableSinglePin || pins.length !== 1 || !onPickLocation) return;
              const ll = (e.target as L.Marker).getLatLng();
              onPickLocation({ lat: ll.lat, lng: ll.lng });
            },
          }}
        />
      ))}
      {activePin ? (
        <Popup position={{ lat: activePin.lat, lng: activePin.lng }} eventHandlers={{ remove: () => setActivePinId(null) }}>
          <div className="min-w-[180px] text-sm">
            <p className="font-semibold">{activePin.title}</p>
            <p className="text-[var(--muted)]">{activePin.kindLabel}</p>
            <p className="text-[var(--muted)]">{activePin.city_zone}</p>
            <p className="font-mono text-xs">{activePin.priceLabel}</p>
            <Link to={`/dashboard/properties/${activePin.id}`} className="mt-1 inline-block text-[var(--accent)] hover:underline">
              Ver ficha
            </Link>
          </div>
        </Popup>
      ) : null}
    </MapContainer>
  );
}

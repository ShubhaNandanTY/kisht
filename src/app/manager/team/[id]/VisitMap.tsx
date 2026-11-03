"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

type Visit = { id: string; lat: number; lng: number; label: string; far: boolean; shopLat: number | null; shopLng: number | null };

/** Where each visit was logged, joined to the borrower's shop. Long joins are visits logged far from the shop. */
export function VisitMap({ visits }: { visits: Visit[] }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current || visits.length === 0) return;
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !el.current) return;
      map = L.map(el.current, { scrollWheelZoom: false, attributionControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(map);
      const bounds = L.latLngBounds([]);
      visits.forEach((v, i) => {
        const color = v.far ? "#b42318" : "#0e6b4f";
        if (v.shopLat !== null && v.shopLng !== null) {
          L.polyline([[v.lat, v.lng], [v.shopLat, v.shopLng]], { color, weight: 2, dashArray: "4 4" }).addTo(map!);
          L.circleMarker([v.shopLat, v.shopLng], { radius: 4, color: "#98a1ae", weight: 2, fillColor: "#fff", fillOpacity: 1 }).addTo(map!);
          bounds.extend([v.shopLat, v.shopLng]);
        }
        L.circleMarker([v.lat, v.lng], { radius: 7, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 })
          .bindTooltip(`${i + 1}. ${v.label}${v.far ? " · far from shop" : ""}`)
          .addTo(map!);
        bounds.extend([v.lat, v.lng]);
      });
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [visits]);

  if (visits.length === 0) return null;
  return (
    <div>
      <div ref={el} className="h-64 overflow-hidden rounded-xl border border-line" role="img" aria-label="Map of visit locations" />
      <p className="mt-2 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-accent" /> At the shop
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-danger" /> More than 500 m away
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full border-2 border-faint" /> Shop
        </span>
      </p>
    </div>
  );
}

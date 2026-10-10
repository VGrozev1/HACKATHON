"use client";

// Leaflet maps (OpenStreetMap tiles). Leaflet touches `window`, so this module is only
// ever loaded through ./index.tsx, which imports it client-side with ssr: false.

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import Link from "next/link";
import { useMemo } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip } from "react-leaflet";
import type { Machine } from "@/types";
import { formatEUR } from "@/lib/format";
import { locationLabel, stockLevel } from "@/components/status";

// SVG attributes can't read CSS variables, so the map uses the same colours as hex.
const HEX = { ok: "#16a34a", warn: "#d97706", crit: "#dc2626", brand: "#0b7f8a", offline: "#64748b" };
const SOFIA: [number, number] = [42.675, 23.335];
const TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const drawOrder = (m: Machine) => (m.status === "offline" ? 3 : { ok: 0, warn: 1, crit: 2 }[stockLevel(m.stockPercent)]);

export function FleetMap({ machines, className }: { machines: Machine[]; className?: string }) {
  return (
    <MapContainer center={SOFIA} zoom={12} scrollWheelZoom={false} className={className} style={{ height: "100%", width: "100%" }}>
      <TileLayer url={TILES} attribution={ATTRIBUTION} />
      {/* Draw healthy machines first so the red and offline ones sit on top. */}
      {[...machines].sort((a, b) => drawOrder(a) - drawOrder(b)).map((m) => {
        const level = stockLevel(m.stockPercent);
        const color = m.status === "offline" ? HEX.offline : HEX[level];
        return (
          <CircleMarker
            key={m.id}
            center={[m.lat, m.lng]}
            radius={13}
            pathOptions={{ color: "#fff", weight: 3, fillColor: color, fillOpacity: 1 }}
          >
            <Tooltip direction="top" offset={[0, -12]}>
              {m.name} · {m.stockPercent}%
            </Tooltip>
            <Popup>
              <div className="min-w-52 space-y-1">
                <div className="text-base font-semibold">{m.name}</div>
                <div className="text-sm text-slate-600">
                  {locationLabel[m.locationType]} · {m.status === "offline" ? "Offline" : "Online"}
                </div>
                <div className="text-sm">
                  Stock <b style={{ color }}>{m.stockPercent}%</b> · Today {m.todaySales} sold, {formatEUR(m.todayRevenue)}
                </div>
                {m.alerts.length > 0 && <div className="text-sm text-slate-600">{m.alerts.length} alert{m.alerts.length > 1 ? "s" : ""}</div>}
                <Link href={`/machines/${m.id}`} className="mt-1 inline-block text-sm font-semibold" style={{ color: HEX.brand }}>
                  Open machine →
                </Link>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

export interface RouteStop {
  order: number;
  machineName: string;
  lat: number;
  lng: number;
}

function numberIcon(n: number) {
  return L.divIcon({
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    html: `<div style="width:32px;height:32px;border-radius:9999px;background:${HEX.brand};color:#fff;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:grid;place-items:center;font:700 15px/1 system-ui,sans-serif">${n}</div>`,
  });
}

export function RouteMap({ stops, className }: { stops: RouteStop[]; className?: string }) {
  const sorted = useMemo(() => [...stops].sort((a, b) => a.order - b.order), [stops]);
  const bounds = useMemo(
    () => (sorted.length ? L.latLngBounds(sorted.map((s) => [s.lat, s.lng] as [number, number])).pad(0.25) : undefined),
    [sorted],
  );
  return (
    <MapContainer
      bounds={bounds}
      center={bounds ? undefined : SOFIA}
      zoom={bounds ? undefined : 12}
      scrollWheelZoom={false}
      className={className}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer url={TILES} attribution={ATTRIBUTION} />
      <Polyline positions={sorted.map((s) => [s.lat, s.lng])} pathOptions={{ color: HEX.brand, weight: 4, opacity: 0.75, dashArray: "8 8" }} />
      {sorted.map((s) => (
        <Marker key={s.order} position={[s.lat, s.lng]} icon={numberIcon(s.order)}>
          <Tooltip direction="top" offset={[0, -16]}>
            {s.order}. {s.machineName}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}

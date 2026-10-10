"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const loading = () => <Skeleton className="size-full rounded-xl" />;

/** Fleet map: one marker per machine, coloured by stock level. Client-only (Leaflet). */
export const FleetMap = dynamic(() => import("./leaflet-maps").then((m) => m.FleetMap), { ssr: false, loading });

/** Route map: numbered stops joined in visiting order. Client-only (Leaflet). */
export const RouteMap = dynamic(() => import("./leaflet-maps").then((m) => m.RouteMap), { ssr: false, loading });

export type { RouteStop } from "./leaflet-maps";

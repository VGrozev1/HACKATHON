"use client";

// Recharts wrappers styled for the projector: big axis labels, few gridlines,
// the brand accent for "ours" and neutral grey for comparisons.

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ForecastPoint, SalesPoint } from "@/types";
import { formatDate, formatEUR, formatEURRound, formatShortDate } from "@/lib/format";

const BRAND = "var(--primary)";
const GREY = "var(--neutral-chart)";
const AXIS = { fontSize: 14, fill: "var(--muted-foreground)" };
const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  boxShadow: "0 8px 24px rgb(0 0 0 / 0.08)",
  fontSize: 15,
  padding: "10px 14px",
};

export function SalesAreaChart({ data, height = 300 }: { data: SalesPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND} stopOpacity={0.35} />
            <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="date" tickFormatter={formatShortDate} tick={AXIS} tickLine={false} axisLine={false} minTickGap={40} />
        <YAxis tickFormatter={(v: number) => formatEURRound(v)} tick={AXIS} tickLine={false} axisLine={false} width={64} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(d) => formatDate(String(d))}
          formatter={(value, _name, item) => [
            `${formatEUR(Number(value))} · ${(item.payload as SalesPoint).units} items`,
            "Sales",
          ]}
        />
        <Area type="monotone" dataKey="revenue" stroke={BRAND} strokeWidth={2.5} fill="url(#salesFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ForecastChart({ data, today, height = 300 }: { data: ForecastPoint[]; today: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 24, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="date" tickFormatter={formatShortDate} tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(d) => formatDate(String(d))}
          formatter={(value, name) => [value == null ? "–" : `${value} items`, name === "actual" ? "Actual" : "Forecast"]}
        />
        <Legend
          itemSorter={null}
          verticalAlign="bottom"
          align="center"
          height={32}
          iconType="plainline"
          formatter={(v) => <span style={{ color: "var(--foreground)", fontSize: 15 }}>{v === "actual" ? "Actual" : "Forecast"}</span>}
        />
        <ReferenceLine x={today} stroke="var(--foreground)" strokeOpacity={0.4} strokeDasharray="3 3" label={{ value: "Today", position: "top", fill: "var(--foreground)", fontSize: 13, fontWeight: 600 }} />
        <Line type="monotone" dataKey="forecast" stroke={BRAND} strokeWidth={2.5} strokeDasharray="7 5" dot={false} />
        <Line type="monotone" dataKey="actual" stroke="var(--foreground)" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ComparisonBarChart({
  data,
  height = 320,
}: {
  data: { metric: string; agent: number; fixed: number }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 24, right: 8, bottom: 0, left: 0 }} barGap={8} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="metric" tick={{ ...AXIS, fontSize: 15, fill: "var(--foreground)" }} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)" }} />
        <Legend
          itemSorter={null}
          verticalAlign="top"
          align="right"
          height={32}
          formatter={(v) => <span style={{ color: "var(--foreground)", fontSize: 15 }}>{v}</span>}
        />
        <Bar dataKey="agent" name="VendAI agent" fill={BRAND} radius={[8, 8, 0, 0]} label={{ position: "top", fontSize: 16, fontWeight: 700, fill: "var(--foreground)" }} />
        <Bar dataKey="fixed" name="Fixed weekly order" fill={GREY} radius={[8, 8, 0, 0]} label={{ position: "top", fontSize: 16, fontWeight: 700, fill: "var(--muted-foreground)" }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DailyStockOutsChart({
  data,
  height = 320,
}: {
  data: { date: string; agentStockOuts: number; fixedStockOuts: number }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 24, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="date" tickFormatter={(d: string) => formatDate(d).split(" ")[0] + " " + formatDate(d).split(" ")[1]} tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(d) => formatDate(String(d))} />
        <Legend
          itemSorter={null}
          verticalAlign="top"
          align="right"
          height={32}
          formatter={(v) => <span style={{ color: "var(--foreground)", fontSize: 15 }}>{v}</span>}
        />
        <Line type="monotone" dataKey="agentStockOuts" name="VendAI agent" stroke={BRAND} strokeWidth={3} dot={{ r: 4 }} />
        <Line type="monotone" dataKey="fixedStockOuts" name="Fixed weekly order" stroke={GREY} strokeWidth={3} dot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

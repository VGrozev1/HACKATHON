// Regression tests for the tools that no longer have a USE_MOCK branch —
// list_machines, get_stock, forecast, plan_route, check_alerts — plus
// get_weather/get_holidays' real-mode path (src/lib/sim/calendar.ts).
// Since these always call the real API now, there's no module-level mock
// data to test them against offline. Instead, this starts a tiny in-process
// HTTP server serving realistic fixtures (api-types.ts shapes), points
// APP_URL at it, and runs the same kind of assertions test-tools.ts used
// to run against mock-data.ts — still fast, free, and deterministic, just
// via a real HTTP round-trip to localhost instead of an in-memory object.
//
// create_purchase_order/create_suggestion still have a real USE_MOCK
// branch (no real product/supplier/warehouse endpoint exists) — those stay
// covered by test-tools.ts and test-guardrails.ts.
import { createServer } from "node:http";
import { addDays, holidayOn, weatherOn } from "../src/lib/sim/calendar.ts";

const TODAY = "2026-10-10"; // a Saturday with no holiday in HOLIDAYS' table

const machines = [
  {
    id: "SOF-GYM-01",
    name: "Gym Lozenets",
    locationType: "GYM",
    city: "Sofia",
    lat: 42.68,
    lng: 23.31,
    online: false,
    stockPercent: 40,
    salesToday: { units: 0, revenue: 0 },
    alerts: [{ kind: "OFFLINE", message: "Machine is not reporting", likelyCause: "Card reader or modem lost connection" }],
  },
  {
    id: "SOF-OFF-01",
    name: "Office Park",
    locationType: "OFFICE",
    city: "Sofia",
    lat: 42.61,
    lng: 23.38,
    online: true,
    stockPercent: 70,
    salesToday: { units: 5, revenue: 9.2 },
    alerts: [
      { kind: "ZERO_SALES", message: "No sales today; usually about 11" },
      { kind: "CASH_MISMATCH", message: "Cash off by 3.2", likelyCause: "Possible theft" },
    ],
  },
  { id: "SOF-HOS-01", name: "City Hospital", locationType: "HOSPITAL", city: "Sofia", lat: 42.68, lng: 23.32, online: true, stockPercent: 90, salesToday: { units: 2, revenue: 3.6 }, alerts: [] },
];

const detail: Record<string, unknown> = {
  "SOF-GYM-01": {
    ...machines[0],
    address: "Vitosha Blvd 1",
    slots: [{ slotId: "SOF-GYM-01-A1", code: "A1", productId: "water-500", productName: "Water 0.5l", capacity: 20, quantity: 3, nextExpiry: null, stockOut: false }],
    lastVisit: null,
    nextVisit: null,
  },
};

const forecast: Record<string, unknown> = {
  "SOF-GYM-01": {
    machineId: "SOF-GYM-01",
    from: addDays(TODAY, 1),
    until: addDays(TODAY, 4), // a 3-day window, so avgDailySales = baseline / 3
    slots: [{ slotId: "SOF-GYM-01-A1", productId: "water-500", baseline: 13.5, adjusted: null, reason: null }],
    history: [],
  },
};

const server = createServer((req, res) => {
  const url = req.url ?? "";
  res.setHeader("content-type", "application/json");
  if (url === "/api/health") return res.end(JSON.stringify({ ok: true, db: "up", today: TODAY }));
  if (url === "/api/machines") return res.end(JSON.stringify(machines));
  const fc = url.match(/^\/api\/machines\/([^/]+)\/forecast$/);
  if (fc) {
    const id = decodeURIComponent(fc[1]);
    if (!forecast[id]) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: "Machine not found" }));
    }
    return res.end(JSON.stringify(forecast[id]));
  }
  const m = url.match(/^\/api\/machines\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (!detail[id]) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: "Machine not found" }));
    }
    return res.end(JSON.stringify(detail[id]));
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
});

let failures = 0;
function check(description: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`✅ ${description}`);
  } else {
    failures++;
    console.log(`❌ ${description}`);
    if (detail !== undefined) console.log(`   ${JSON.stringify(detail)}`);
  }
}

async function main() {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as { port: number };
  process.env.APP_URL = `http://localhost:${port}`;
  delete process.env.USE_MOCK; // these tools have no mock branch to accidentally hit

  const { runTool } = await import("./tools.ts");

  const list = (await runTool("list_machines", {})) as any[];
  check("list_machines returns the 3 fixture machines", Array.isArray(list) && list.length === 3, list);
  check("list_machines passes through real alert kinds", list.some((m) => m.alerts.some((a: any) => a.kind === "CASH_MISMATCH")), list);

  const stock = (await runTool("get_stock", { machine_id: "SOF-GYM-01" })) as any;
  check("get_stock returns the fixture's slots", Array.isArray(stock) && stock[0]?.productName === "Water 0.5l", stock);

  const badStock = await runTool("get_stock", { machine_id: "NOPE" }).catch((e) => ({ threw: e.message }));
  check("get_stock(unknown) throws (caught by agent.ts's own try/catch, same as a live 404)", !!(badStock as any).threw, badStock);

  const fc = (await runTool("forecast", { machine_id: "SOF-GYM-01", days: 2 })) as any;
  const expectedDaily = Math.round((13.5 / 3) * 100) / 100; // baseline / 3-day window
  check(
    "forecast converts the real baseline/window into avgDailySales correctly",
    fc.forecast[0]?.avgDailySales === expectedDaily && fc.forecast[0]?.expectedUnits === Math.round(expectedDaily * 2),
    fc,
  );
  check("forecast resolves the product name from machine detail, not just the id", fc.forecast[0]?.product === "Water 0.5l", fc);

  const route = (await runTool("plan_route", { machine_ids: ["SOF-GYM-01", "SOF-OFF-01", "SOF-HOS-01"] })) as any;
  check("plan_route orders all 3 real machines by real coordinates", Array.isArray(route.route) && route.route.length === 3, route);

  const alerts = (await runTool("check_alerts", {})) as any[];
  check(
    "check_alerts flattens every machine's real alerts, with cause appended when present",
    alerts.some((a) => a.kind === "OFFLINE" && a.message.includes("Card reader")) &&
      alerts.some((a) => a.kind === "ZERO_SALES" && !a.message.includes("(")), // no likelyCause in this fixture
    alerts,
  );

  const weather = (await runTool("get_weather", {})) as any[];
  const expectedWeather = [1, 2, 3].map((o) => weatherOn(addDays(TODAY, o)));
  check(
    "get_weather (real mode) matches the simulated calendar's weatherOn(), not Open-Meteo",
    weather.length === 3 && weather.every((d, i) => d.maxTempC === expectedWeather[i].tMaxC),
    { weather, expectedWeather },
  );

  const holidays = (await runTool("get_holidays", {})) as any[];
  const expectedHolidayDays = Array.from({ length: 8 }, (_, i) => addDays(TODAY, i)).filter((d) => holidayOn(d));
  check(
    "get_holidays (real mode) matches the simulated calendar's holidayOn()",
    holidays.length === expectedHolidayDays.length,
    { holidays, expectedHolidayDays },
  );

  server.close();
  console.log(failures === 0 ? "\nAll live-fixture tool tests passed." : `\n${failures} live-fixture tool test(s) failed.`);
  if (failures > 0) process.exit(1);
}

main();

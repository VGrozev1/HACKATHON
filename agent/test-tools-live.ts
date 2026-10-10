// Regression tests for every tool in tools.ts against a tiny in-process
// fake server standing in for Todor's real Agent API (see api.md). All 10
// tools always call the real API now — there's no local mock data left in
// agent/ to test against offline, so this is the only tool-level test file.
//
// create_suggestion and notify_stocker always send a Telegram message on
// success (no way around it — there's no "pending suggestion"/"planned
// route" that doesn't notify someone), so without live Telegram
// credentials this only exercises their *rejection*/error paths, which
// return before ever reaching Telegram. create_purchase_order's "approved"
// and "rejected" paths are both safe to test (only "awaiting_approval"
// sends a Telegram message); test-guardrails.ts used to cover more of this
// client-side, but the real catalog/guardrail checks now live server-side
// (orders.ts/suggestions.ts) — there's nothing left in agent/ to unit-test
// in isolation.
import { createServer } from "node:http";
import { addDays } from "../src/lib/sim/calendar.ts";

const TODAY = "2026-10-10";

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
    alerts: [],
  },
  { id: "SOF-OFF-01", name: "Office Park", locationType: "OFFICE", city: "Sofia", lat: 42.61, lng: 23.38, online: true, stockPercent: 70, salesToday: { units: 5, revenue: 9.2 }, alerts: [] },
  { id: "SOF-HOS-01", name: "City Hospital", locationType: "HOSPITAL", city: "Sofia", lat: 42.68, lng: 23.32, online: true, stockPercent: 90, salesToday: { units: 2, revenue: 3.6 }, alerts: [] },
];

const stock: Record<string, unknown> = {
  "SOF-GYM-01": {
    machine_id: "SOF-GYM-01",
    products: [{ product: "Water 0.5l", product_id: "water-500", count: 3, capacity: 20, slots: ["A1"], next_expiry: null }],
  },
};

const forecast: Record<string, unknown> = {
  "SOF-GYM-01": {
    machine_id: "SOF-GYM-01",
    days: 2,
    from: addDays(TODAY, 1),
    until: addDays(TODAY, 3),
    forecast: [{ product: "Water 0.5l", product_id: "water-500", avgDailySales: 4.5, expectedUnits: 9 }],
  },
};

const alerts = [
  { machineId: "SOF-GYM-01", machineName: "Gym Lozenets", kind: "OFFLINE", message: "Machine is not reporting", likelyCause: "Card reader or modem lost connection" },
  { machineId: "SOF-OFF-01", machineName: "Office Park", kind: "ZERO_SALES", message: "No sales today; usually about 11", likelyCause: null },
];

const server = createServer(async (req, res) => {
  const url = req.url ?? "";
  res.setHeader("content-type", "application/json");
  const json = (status: number, body: unknown) => {
    res.statusCode = status;
    res.end(JSON.stringify(body));
  };
  const body = async () => JSON.parse(await new Promise<string>((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  }));

  if (url === "/api/today") return json(200, { today: TODAY, tomorrow: addDays(TODAY, 1) });
  if (url === "/api/machines") return json(200, machines);
  if (url === "/api/warehouse") {
    return json(200, { name: "Central Warehouse", location: { lat: 42.6865, lng: 23.4017 }, products: [] });
  }
  if (url === "/api/alerts") return json(200, alerts);
  if (url.startsWith("/api/weather")) {
    return json(200, [1, 2, 3].map((o) => ({ date: addDays(TODAY, o), maxTempC: 18, rainMm: 0, note: null })));
  }
  if (url.startsWith("/api/holidays")) return json(200, []);

  const stockMatch = url.match(/^\/api\/machines\/([^/]+)\/stock$/);
  if (stockMatch) {
    const id = decodeURIComponent(stockMatch[1]);
    return stock[id] ? json(200, stock[id]) : json(404, { error: "Machine not found" });
  }
  const forecastMatch = url.match(/^\/api\/machines\/([^/]+)\/forecast/);
  if (forecastMatch) {
    const id = decodeURIComponent(forecastMatch[1]);
    return forecast[id] ? json(200, forecast[id]) : json(404, { error: "Machine not found" });
  }

  if (req.method === "POST" && url === "/api/orders") {
    const b = await body();
    if (b.supplier === "BadCo") {
      return json(200, { id: "PO-0001", supplier: "BadCo", lines: b.lines, reason: b.reason, createdAt: new Date().toISOString(), status: "rejected", totalEur: 0, reasons: ['"BadCo" is not one of our suppliers.'], emailed: false, delivery_date: addDays(TODAY, 2) });
    }
    return json(201, { id: "PO-0002", supplier: b.supplier, lines: b.lines, reason: b.reason, createdAt: new Date().toISOString(), status: "approved", totalEur: 12.5, reasons: [], emailed: true, delivery_date: addDays(TODAY, 2) });
  }
  if (req.method === "POST" && url === "/api/suggestions") {
    const b = await body();
    if (b.machine_id === "NOPE") {
      return json(422, { error: 'Unknown machine id "NOPE".', status: "rejected", reasons: ['Unknown machine id "NOPE".'] });
    }
    return json(500, { error: "this fixture only exercises the rejection path (see file header)" });
  }
  if (req.method === "POST" && url === "/api/visits") {
    const b = await body();
    if (b.route.includes("NOPE")) return json(400, { error: "Unknown machine ids: NOPE" });
    return json(500, { error: "this fixture only exercises the rejection path (see file header)" });
  }

  return json(404, { error: "not found" });
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

  const { runTool } = await import("./tools.ts");

  const list = (await runTool("list_machines", {})) as any[];
  check("list_machines returns the 3 fixture machines", Array.isArray(list) && list.length === 3, list);

  const s = (await runTool("get_stock", { machine_id: "SOF-GYM-01" })) as any;
  check("get_stock returns the per-product shape", s.products?.[0]?.product === "Water 0.5l" && s.products[0].count === 3, s);

  const badStock = await runTool("get_stock", { machine_id: "NOPE" }).catch((e) => ({ threw: e.message }));
  check("get_stock(unknown) throws (caught by agent.ts's own try/catch)", !!(badStock as any).threw, badStock);

  const fc = (await runTool("forecast", { machine_id: "SOF-GYM-01", days: 2 })) as any;
  check("forecast passes the real response straight through", fc.forecast?.[0]?.avgDailySales === 4.5 && fc.forecast[0].expectedUnits === 9, fc);

  const badDays = (await runTool("forecast", { machine_id: "SOF-GYM-01", days: 30 })) as any;
  check("forecast with days out of range is still validated before any call", !!badDays?.error, badDays);

  const route = (await runTool("plan_route", { machine_ids: ["SOF-GYM-01", "SOF-OFF-01", "SOF-HOS-01"] })) as any;
  check("plan_route orders all 3 machines, using /api/warehouse for the depot", Array.isArray(route.route) && route.route.length === 3, route);

  const badRoute = (await runTool("plan_route", { machine_ids: ["NOPE"] })) as any;
  check("plan_route(unknown machine) returns an error object", !!badRoute?.error, badRoute);

  const weather = (await runTool("get_weather", {})) as any[];
  check("get_weather passes /api/weather straight through", Array.isArray(weather) && weather.length === 3, weather);

  process.env.DEMO_HEATWAVE = "1";
  const heatwave = (await runTool("get_weather", {})) as any[];
  delete process.env.DEMO_HEATWAVE;
  check("DEMO_HEATWAVE=1 forces a fixed 35°C forecast without calling /api/weather", heatwave.every((d) => d.maxTempC === 35), heatwave);

  const holidays = await runTool("get_holidays", {});
  check("get_holidays passes /api/holidays straight through", Array.isArray(holidays), holidays);

  const alertResult = (await runTool("check_alerts", {})) as any[];
  check("check_alerts passes /api/alerts straight through, with machineName and likelyCause", alertResult.length === 2 && alertResult[0].machineName === "Gym Lozenets", alertResult);

  const approved = (await runTool("create_purchase_order", { supplier: "FreshCo", lines: [{ product: "Water 0.5l", quantity: 40 }], reason: "test" })) as any;
  check("create_purchase_order returns an approved order (no Telegram needed)", approved.status === "approved" && approved.emailed === true, approved);

  const rejected = (await runTool("create_purchase_order", { supplier: "BadCo", lines: [{ product: "Water 0.5l", quantity: 40 }], reason: "test" })) as any;
  check("create_purchase_order surfaces server-side rejection reasons", rejected.status === "rejected" && rejected.reasons.length > 0, rejected);

  const sugRejected = (await runTool("create_suggestion", {
    type: "extra_stock",
    machine_id: "NOPE",
    suggestion: "test",
    reason: "test",
    expected_effect: "test",
  })) as any;
  check("create_suggestion surfaces a 422 rejection as a normal result, not a throw", sugRejected.status === "rejected" && sugRejected.reasons?.length > 0, sugRejected);

  const badVisit = await runTool("notify_stocker", { route: ["NOPE"], load_lists: [] }).catch((e) => ({ threw: e.message }));
  check("notify_stocker surfaces an invalid-plan error before ever reaching Telegram", !!(badVisit as any).threw, badVisit);

  const unknownTool = (await runTool("not_a_real_tool", {})) as any;
  check("an unknown tool name returns an error object, doesn't throw", !!unknownTool?.error, unknownTool);

  server.close();
  console.log(failures === 0 ? "\nAll live-fixture tool tests passed." : `\n${failures} live-fixture tool test(s) failed.`);
  if (failures > 0) process.exit(1);
}

main();

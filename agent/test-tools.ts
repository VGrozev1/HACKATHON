// Smoke tests for the mock-backed tools in tools.ts — list_machines, get_stock,
// forecast, plan_route, get_weather, get_holidays, check_alerts, and the
// unknown-tool fallback. create_purchase_order / create_suggestion are
// covered in depth by test-guardrails.ts instead.
//
// Forces USE_MOCK so results are deterministic regardless of how this file
// is invoked — no real API or network call happens here.
process.env.USE_MOCK = "1";

import { runTool } from "./tools.ts";

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
  const machines = (await runTool("list_machines", {})) as any[];
  check("list_machines returns an array of 3", Array.isArray(machines) && machines.length === 3, machines);
  check(
    "list_machines entries have id/name/locationType",
    machines.every((m) => typeof m.id === "string" && typeof m.name === "string" && typeof m.locationType === "string"),
  );

  const stock = (await runTool("get_stock", { machine_id: "GYM-01" })) as any;
  check("get_stock(GYM-01) returns an array, not an error", Array.isArray(stock), stock);

  const badStock = (await runTool("get_stock", { machine_id: "NOPE-99" })) as any;
  check("get_stock(unknown) returns an error object, doesn't throw", !!badStock?.error, badStock);

  const fc = (await runTool("forecast", { machine_id: "GYM-01", days: 2 })) as any;
  check("forecast(GYM-01, 2) returns a forecast array", Array.isArray(fc?.forecast), fc);
  check(
    "forecast expectedUnits = round(avgDailySales * days)",
    fc.forecast.every((line: any) => line.expectedUnits === Math.round(line.avgDailySales * 2)),
    fc,
  );

  const badDays = (await runTool("forecast", { machine_id: "GYM-01", days: 30 })) as any;
  check("forecast with days out of range returns an error object", !!badDays?.error, badDays);

  const badMachineForecast = (await runTool("forecast", { machine_id: "NOPE-99", days: 2 })) as any;
  check("forecast(unknown machine) returns an error object", !!badMachineForecast?.error, badMachineForecast);

  const route = (await runTool("plan_route", { machine_ids: ["GYM-01", "OFF-01", "HOS-01"] })) as any;
  check("plan_route returns a route of all 3 machines", Array.isArray(route?.route) && route.route.length === 3, route);

  const badRoute = (await runTool("plan_route", { machine_ids: ["GYM-01", "NOPE-99"] })) as any;
  check("plan_route(unknown machine) returns an error object", !!badRoute?.error, badRoute);

  const weather = (await runTool("get_weather", {})) as any[];
  check("get_weather returns a 3-day forecast", Array.isArray(weather) && weather.length === 3, weather);

  process.env.DEMO_HEATWAVE = "1";
  const heatwave = (await runTool("get_weather", {})) as any[];
  delete process.env.DEMO_HEATWAVE;
  check(
    "DEMO_HEATWAVE=1 forces a fixed 35°C forecast",
    Array.isArray(heatwave) && heatwave.every((d) => d.maxTempC === 35),
    heatwave,
  );

  const holidays = await runTool("get_holidays", {});
  check("get_holidays returns an array (possibly empty)", Array.isArray(holidays), holidays);

  const alerts = (await runTool("check_alerts", {})) as any[];
  check("check_alerts returns an array", Array.isArray(alerts), alerts);
  check(
    "every alert has a known kind",
    alerts.every((a) => ["OFFLINE", "ZERO_SALES", "CASH_MISMATCH"].includes(a.kind)),
    alerts,
  );

  const unknownTool = (await runTool("not_a_real_tool", {})) as any;
  check("an unknown tool name returns an error object, doesn't throw", !!unknownTool?.error, unknownTool);

  console.log(
    failures === 0 ? "\nAll tool smoke tests passed." : `\n${failures} tool smoke test(s) failed.`,
  );
  if (failures > 0) process.exit(1);
}

main();

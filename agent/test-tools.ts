// Smoke tests for the tools that still have a USE_MOCK=1 fallback:
// get_weather, get_holidays, and the unknown-tool dispatcher fallback.
// list_machines, get_stock, forecast, plan_route, and check_alerts always
// call the real API now (no mock branch) — see test-tools-live.ts for
// those. create_purchase_order/create_suggestion are covered in depth by
// test-guardrails.ts instead.
//
// Forces USE_MOCK so results are deterministic regardless of how this file
// is invoked. Note get_weather without DEMO_HEATWAVE still calls the real
// Open-Meteo API even under USE_MOCK=1 (there's no simulated economy for
// mock mode to stay consistent with) — that one test does touch the network.
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

  const unknownTool = (await runTool("not_a_real_tool", {})) as any;
  check("an unknown tool name returns an error object, doesn't throw", !!unknownTool?.error, unknownTool);

  console.log(
    failures === 0 ? "\nAll tool smoke tests passed." : `\n${failures} tool smoke test(s) failed.`,
  );
  if (failures > 0) process.exit(1);
}

main();

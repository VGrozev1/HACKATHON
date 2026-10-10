# Demo script (task C9)

The live demo for the judges: about 4 minutes, six screens, one number. Kalin presents and clicks; Viktor has the phone with Telegram; Todor watches the laptop's terminal and the demo inbox.

Pitch deck (C8): https://claude.ai/artifact/16dZFBjUiRPNdYMuUx7hac (7 slides; the demo slide hands over to the app). Kalin shares it from its Share menu.

The in-app **Demo script** button (bottom-right) shows the same steps. Keys **1–6** jump straight to each screen; **?** opens the panel.

## Before going on stage

- [ ] Open the deployed link (or `npm run dev`) in Chrome, full screen (F11), zoom 100%.
- [ ] Projector at 1920×1080: the app scales its text up automatically from 1700 px wide.
- [ ] Hard-reload once (Ctrl+Shift+R) so the demo starts clean: the €412 order only appears after "Run night".
- [ ] Header shows **Demo mode · simulated data** or **live simulation**, and **Sat 10 Oct**. If an amber **Using backup data** badge shows, the API is down but the demo still works: carry on.
- [ ] Phone hotspot ready in case the venue Wi-Fi blocks Telegram or the Claude API.
- [ ] Backup recording on the desktop (see below).
- [ ] `npm run demo:check` passed after the last merge.

## The click path

| # | Key | Screen | Click | Say (short) | Time |
|---|-----|--------|-------|-------------|------|
| 1 | `1` | Fleet overview | Point at the KPIs, then switch **Cards → Map** and back | "20 machines across Sofia. Four are low on stock, two have food about to expire, one is offline, and one suddenly stopped selling. Today someone checks all of this by hand, every night." | 30 s |
| 2 | `2` | Gym Lozenets | Click the **Gym Lozenets** card | "Water and Red Bull are sold out. Here are 60 days of sales, stock per slot with expiry dates, and the forecast: dashed is what we expected, solid is what happened." | 30 s |
| 3 | `3` | Run night | Press **▶ Run tonight's agent** and let it stream | "This is what runs every night at 22:00. It reads stock, forecasts, checks the weather, and here it raises the gym's forecast by 30% for a hot weekend. It plans a 6-stop route and orders from suppliers. And here, a **guardrail**: the €412 snack order is over our €300 limit, so it can't send it on its own." Then open the **Route** and **Decisions** tabs. | 60 s |
| 4 | `4` | Orders | Click **Approve** on the €412 Balkan Snack Distribution row (or approve in Telegram on the phone) | "Small orders go out automatically. Big ones wait for a human: one tap, in Telegram or here. The limit is enforced in code, not just in the prompt." | 30 s |
| 5 | `5` | Simulation | Press **⏩ Fast-forward a week** | "Same demand, two strategies: our agent against a fixed weekly order. After a week: **86% fewer stock-outs** and 73% less waste." Pause on the number. | 40 s |
| 6 | `6` | Investor | Switch payout **A / B / C** | "Machines are often owned by investors. They get a clean monthly statement, under whichever payout model they signed." | 20 s |

Close: "Ordering is the hidden labour in vending. We turned it into one click, with a human in the loop for the big decisions."

## If something breaks

- **API or Wi-Fi down:** keep going; every screen falls back to the built-in demo data (amber **Using backup data** badge). Don't apologise for it.
- **Run night hangs:** wait 10 seconds, then press **Run again**. Still stuck: switch to the backup recording.
- **Telegram doesn't arrive:** approve on the Orders screen instead; mention that the same button exists in Telegram.
- **Anything else:** play the backup recording and narrate over it.

## Backup recording

- `npm run demo:record` replays the whole click path in a browser and saves a video under `test-results/`. It's a quick safety net, not the polished one.
- At feature freeze (hour 20), record the real thing with OBS or the Windows Game Bar (Win+Alt+R) at 1920×1080, following the table above, with narration.

## Rehearsal

- `npm run demo:check` runs the click path above in a real browser (Playwright, `e2e/demo.spec.ts`) and fails if any step is broken. Run it after every merge and before going on stage.
- Rehearse out loud at least three times; the whole run must fit with a minute to spare.

// What the team receives after a night's run, all built from the database:
//
// 1. Telegram: tomorrow's route (stops in order).
// 2. Telegram: what each machine on the route needs, as a checklist (tap an
//    item to tick it ✅) with a Done button per machine.
// 3. One email with everything missing from those machines combined,
//    grouped by supplier.
//
// "Missing" = each slot's capacity minus what is in it now (unexpired stock),
// read from the database. The route's visits are set to load exactly that, so
// tapping Done fills the machine to the top.

import { Resend } from "resend";
import { db } from "@/lib/db";
import type { LoadItem } from "@/lib/api-types";
import { addDays } from "@/lib/sim/calendar";
import { MAX_BUTTONS_PER_MESSAGE, telegram, type InlineKeyboard } from "@/lib/integrations/telegram";
import { simNight } from "./sim-clock";
import { machineSlotStock } from "./stock";

const longDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const eur = (n: number) => `€${n.toFixed(2)}`;
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export interface StopNeeds {
  visitId: string | null;
  routeOrder: number;
  machineId: string;
  machineName: string;
  address: string | null;
  /** Per product, summed over its slots. */
  items: { productId: string; productName: string; quantity: number }[];
  /** Per slot, for the visit's load list. */
  slots: LoadItem[];
}

/** What a machine is missing right now: slot capacity minus unexpired stock. */
async function missingFor(machineId: string, today: string) {
  const slots = await machineSlotStock(machineId, simNight(today));
  const perSlot: LoadItem[] = slots
    .filter((s) => s.capacity - s.quantity > 0)
    .map((s) => ({ slotId: s.slotId, productId: s.productId, productName: s.productName, quantity: s.capacity - s.quantity, reason: "Missing: fill to capacity" }));
  const perProduct = new Map<string, { productId: string; productName: string; quantity: number }>();
  for (const l of perSlot) {
    const p = perProduct.get(l.productId) ?? { productId: l.productId, productName: l.productName, quantity: 0 };
    p.quantity += l.quantity;
    perProduct.set(l.productId, p);
  }
  return { perSlot, perProduct: [...perProduct.values()] };
}

/**
 * The machines to fill tomorrow, in route order, with what each is missing.
 * Uses the agent's planned route; if it planned none, every machine that is
 * missing something (no route order).
 */
export async function nightNeeds(today: string): Promise<{ date: string; planned: boolean; stops: StopNeeds[] }> {
  const tomorrow = addDays(today, 1);
  const first = await db.visit.findFirst({
    where: { status: { in: ["PLANNED", "SENT"] }, date: { gte: new Date(`${tomorrow}T00:00:00Z`) } },
    orderBy: { date: "asc" },
  });
  const visits = first
    ? await db.visit.findMany({ where: { date: first.date, status: { in: ["PLANNED", "SENT"] } }, include: { machine: true }, orderBy: { routeOrder: "asc" } })
    : [];
  const date = first ? first.date.toISOString().slice(0, 10) : tomorrow;

  const machines = visits.length
    ? visits.map((v) => ({ visitId: v.id, routeOrder: v.routeOrder, machine: v.machine }))
    : (await db.machine.findMany({ orderBy: { id: "asc" } })).map((m, i) => ({ visitId: null, routeOrder: i + 1, machine: m }));

  const stops: StopNeeds[] = [];
  for (const m of machines) {
    const { perSlot, perProduct } = await missingFor(m.machine.id, today);
    if (!perSlot.length && !m.visitId) continue;
    stops.push({
      visitId: m.visitId,
      routeOrder: m.routeOrder,
      machineId: m.machine.id,
      machineName: m.machine.name,
      address: m.machine.address,
      items: perProduct,
      slots: perSlot,
    });
  }
  return { date, planned: visits.length > 0, stops };
}

// ─── Telegram ────────────────────────────────────────────────────────────────

export const UNTICKED = "☐";
export const TICKED = "✅";
/** Telegram's limit for one message's text. */
const MAX_TEXT = 4096;

/** Message 1: the route. */
export function buildRouteMessage(date: string, stops: StopNeeds[]): string {
  if (!stops.length) return `🚚 No stops for ${longDate(date)}: every machine is full.`;
  return [
    `🚚 Route for ${longDate(date)}: ${stops.length} stops`,
    "",
    ...stops.map((s) => `${s.routeOrder}. ${s.machineName}${s.address ? `, ${s.address}` : ""}`),
  ].join("\n");
}

/**
 * Message 2: what each machine needs, as one checklist message: per machine a
 * heading and its items (☐), with a Done button per machine that ticks them
 * all (✅) and fills the machine. Only if the text passes Telegram's 4096
 * character limit does it continue in another message, between machines.
 */
export function buildNeedsMessages(stops: StopNeeds[]): { text: string; keyboard: InlineKeyboard }[] {
  if (!stops.length) return [];
  const units = stops.reduce((n, s) => n + s.items.reduce((m, i) => m + i.quantity, 0), 0);
  const header = `📦 What each machine needs: ${units} items. Tap Done when a machine is full.`;
  const blocks = stops.map((s) => ({
    text: [`📍 ${s.routeOrder}. ${s.machineName}`, ...s.items.map((i) => `${UNTICKED} ${i.productName} × ${i.quantity}`)].join("\n"),
    button: s.visitId ? [{ text: `Done: ${s.routeOrder}. ${s.machineName}`, callback_data: `done:${s.machineId}` }] : null,
  }));

  const messages: { text: string; keyboard: InlineKeyboard }[] = [];
  let text = header;
  let keyboard: InlineKeyboard = [];
  for (const b of blocks) {
    if (text.length + 2 + b.text.length > MAX_TEXT || keyboard.length >= MAX_BUTTONS_PER_MESSAGE) {
      messages.push({ text, keyboard });
      text = "📦 What each machine needs (continued)";
      keyboard = [];
    }
    text += `\n\n${b.text}`;
    if (b.button) keyboard.push(b.button);
  }
  messages.push({ text, keyboard });
  return messages;
}

/** After Done: tick that machine's items in the message text. */
export function tickMachineInText(text: string, routeOrder: string, machineName: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l === `📍 ${routeOrder}. ${machineName}`);
  if (start === -1) return text;
  for (let i = start + 1; i < lines.length && lines[i].startsWith(UNTICKED); i++) {
    lines[i] = TICKED + lines[i].slice(UNTICKED.length);
  }
  lines[start] = `${lines[start]} ✅`;
  return lines.join("\n");
}

// ─── The one email ───────────────────────────────────────────────────────────

/** Everything missing from the machines, combined per product and grouped by supplier. */
export function buildOrderEmail(date: string, stops: StopNeeds[], products: Map<string, { supplier: string; cost: number }>) {
  const totals = new Map<string, { supplier: string; productId: string; productName: string; quantity: number; unitCost: number }>();
  for (const s of stops) {
    for (const i of s.items) {
      const p = products.get(i.productId);
      const line = totals.get(i.productId) ?? { supplier: p?.supplier ?? "Other", productId: i.productId, productName: i.productName, quantity: 0, unitCost: p?.cost ?? 0 };
      line.quantity += i.quantity;
      totals.set(i.productId, line);
    }
  }
  type Line = typeof totals extends Map<string, infer L> ? L : never;
  const bySupplier = new Map<string, Line[]>();
  for (const l of [...totals.values()].sort((a, b) => a.productName.localeCompare(b.productName))) {
    bySupplier.set(l.supplier, [...(bySupplier.get(l.supplier) ?? []), l]);
  }
  const units = [...totals.values()].reduce((n, l) => n + l.quantity, 0);
  const total = [...totals.values()].reduce((n, l) => n + l.quantity * l.unitCost, 0);
  const subtotal = (lines: Line[]) => lines.reduce((n, l) => n + l.quantity * l.unitCost, 0);
  const subject = `Order for ${longDate(date)}: ${units} items to refill ${stops.length} vending machines`;

  const text = [
    `Order for delivery on ${longDate(date)}: everything missing from ${stops.length} of our vending machines in Sofia.`,
    "",
    ...[...bySupplier].flatMap(([supplier, lines]) => [
      supplier,
      ...lines.map((l) => `  ${l.productName} (${l.productId}): ${l.quantity} × ${eur(l.unitCost)} = ${eur(l.quantity * l.unitCost)}`),
      `  Subtotal: ${eur(subtotal(lines))}`,
      "",
    ]),
    `Total: ${units} items, ${eur(total)} excluding VAT`,
    "",
    "VendAI Operations, Sofia",
  ].join("\n");

  const cell = "padding:7px 10px;border-bottom:1px solid #e3e8e4;";
  const num = `${cell}text-align:right;white-space:nowrap;`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#16231d;max-width:700px;line-height:1.5">
<h2 style="margin:0 0 4px">Order for ${longDate(date)}</h2>
<p style="margin:0 0 18px;color:#5b6a62">Everything missing from ${stops.length} of our vending machines in Sofia: ${units} items, ${eur(total)} excluding VAT.</p>
${[...bySupplier]
  .map(
    ([supplier, lines]) => `<h3 style="margin:18px 0 6px">${escapeHtml(supplier)}</h3>
<table style="border-collapse:collapse;width:100%;font-size:14px">
<tr style="background:#eef3ef;text-align:left"><th style="${cell}">Product</th><th style="${cell}">Code</th><th style="${num}">Qty</th><th style="${num}">Unit price</th><th style="${num}">Line total</th></tr>
${lines.map((l) => `<tr><td style="${cell}">${escapeHtml(l.productName)}</td><td style="${cell}font-family:monospace">${escapeHtml(l.productId)}</td><td style="${num}">${l.quantity}</td><td style="${num}">${eur(l.unitCost)}</td><td style="${num}">${eur(l.quantity * l.unitCost)}</td></tr>`).join("\n")}
<tr><td colspan="4" style="padding:7px 10px;font-weight:bold">Subtotal</td><td style="${num}font-weight:bold">${eur(subtotal(lines))}</td></tr>
</table>`,
  )
  .join("\n")}
<p style="margin-top:18px"><b>Total: ${units} items, ${eur(total)}</b> excluding VAT</p>
<p style="margin-top:18px;color:#5b6a62">VendAI Operations, Sofia</p>
</div>`;
  return { subject, text, html, units };
}

// ─── Sending ─────────────────────────────────────────────────────────────────

/** After a run: the route, what each machine needs, and the one order email. */
export async function notifyNight(today: string): Promise<string[]> {
  const { date, stops } = await nightNeeds(today);
  const report: string[] = [];

  // Planned visits load exactly what is missing, so Done fills the machine.
  await Promise.all(
    stops
      .filter((s) => s.visitId)
      .map((s) => db.visit.update({ where: { id: s.visitId! }, data: { loadList: JSON.parse(JSON.stringify(s.slots)) } })),
  );

  const chat = process.env.TELEGRAM_STOCKER_CHAT_ID;
  if (process.env.TELEGRAM_BOT_TOKEN && chat) {
    try {
      await telegram("sendMessage", { chat_id: chat, text: buildRouteMessage(date, stops) });
      for (const m of buildNeedsMessages(stops)) {
        await telegram("sendMessage", { chat_id: chat, text: m.text, reply_markup: { inline_keyboard: m.keyboard } });
      }
      const sent = stops.filter((s) => s.visitId).map((s) => s.visitId!);
      if (sent.length) await db.visit.updateMany({ where: { id: { in: sent } }, data: { status: "SENT" } });
      report.push("route and machine lists sent to Telegram");
    } catch (e) {
      report.push(`Telegram failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (process.env.RESEND_API_KEY && process.env.SUPPLIER_DEMO_EMAIL && stops.length) {
    try {
      const products = await db.product.findMany({ include: { supplier: true } });
      const email = buildOrderEmail(date, stops, new Map(products.map((p) => [p.id, { supplier: p.supplier.name, cost: p.cost }])));
      const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: process.env.RESEND_FROM ?? "Vending AI <onboarding@resend.dev>",
        to: process.env.SUPPLIER_DEMO_EMAIL,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      if (error) throw new Error(error.message);
      report.push(`order email sent (${email.units} items)`);
    } catch (e) {
      report.push(`email failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  return report;
}

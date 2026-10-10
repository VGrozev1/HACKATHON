// Investor login for the portal (/owner). Demo-grade but done properly on the server:
// salted scrypt password hashes, a session cookie signed with HMAC-SHA256, httpOnly and
// sameSite=lax. Server code only (server components, server actions): it reads cookies
// and node:crypto, and must never be imported into a client component.

import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { investorAccounts, type InvestorAccount } from "@/mocks/investors";

export const SESSION_COOKIE = "vendai_investor";
export const SESSION_HOURS = 8;

/** What the portal may know about the signed-in investor: never the password hash. */
export interface PortalInvestor {
  id: string;
  name: string;
  username: string;
  payoutModel: "A" | "B" | "C";
  payoutValue: number;
  machineIds: string[];
}

const toPortal = ({ id, name, username, payoutModel, payoutValue, machineIds }: InvestorAccount): PortalInvestor => ({
  id,
  name,
  username,
  payoutModel,
  payoutValue,
  machineIds,
});

/** AUTH_SECRET signs sessions. Local dev falls back to a fixed secret; production refuses. */
function secret(): string | null {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV !== "production") return "vendai-dev-only-secret-do-not-deploy";
  return null;
}

export const loginConfigured = () => secret() !== null;

// Compared against when the username is unknown, so a wrong username takes as long as a wrong password.
const DUMMY_HASH = `scrypt$${"0".repeat(32)}$${"0".repeat(64)}`;

function passwordMatches(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** The account for these credentials, or null. */
export function checkCredentials(username: string, password: string): PortalInvestor | null {
  const account = investorAccounts.find((a) => a.username === username.trim().toLowerCase());
  const ok = passwordMatches(password, account?.passwordHash ?? DUMMY_HASH);
  return account && ok ? toPortal(account) : null;
}

const sign = (payload: string, key: string) => createHmac("sha256", key).update(payload).digest("base64url");

/** "<investorId>.<expires epoch ms>.<signature>" */
export function createSessionToken(investorId: string): string {
  const key = secret();
  if (!key) throw new Error("AUTH_SECRET is not set");
  const payload = `${investorId}.${Date.now() + SESSION_HOURS * 3_600_000}`;
  return `${payload}.${sign(payload, key)}`;
}

function investorFromToken(token: string | undefined): PortalInvestor | null {
  const key = secret();
  if (!token || !key) return null;
  const lastDot = token.lastIndexOf(".");
  const payload = token.slice(0, lastDot);
  const given = Buffer.from(token.slice(lastDot + 1));
  const expected = Buffer.from(sign(payload, key));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [investorId, expires] = payload.split(".");
  if (!expires || Number(expires) < Date.now()) return null;
  const account = investorAccounts.find((a) => a.id === investorId);
  return account ? toPortal(account) : null;
}

/** The signed-in investor, or null. Reads the request cookie: call it behind a <Suspense>. */
export async function getCurrentInvestor(): Promise<PortalInvestor | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  // The expiry check reads the clock, so it must run at request time, never in a prerender.
  await connection();
  return investorFromToken(token);
}

/** The signed-in investor, or a redirect to the login page that comes back to `next`. */
export async function requireInvestor(next: string): Promise<PortalInvestor> {
  const investor = await getCurrentInvestor();
  if (!investor) redirect(`/login?next=${encodeURIComponent(next)}`);
  return investor;
}

/** Only portal paths are allowed as a post-login destination (no open redirects). */
export function safeNext(next: unknown): string {
  return typeof next === "string" && /^\/owner(\/[A-Za-z0-9-]*)?$/.test(next) ? next : "/owner";
}

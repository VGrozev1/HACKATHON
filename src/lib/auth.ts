// Sign-in for VendAI: investors (the portal at /owner) and operators (the dashboard).
// Demo-grade but done properly on the server: salted scrypt password hashes, a session
// cookie signed with HMAC-SHA256, httpOnly and sameSite=lax. Server code only (server
// components, server actions): it reads cookies and node:crypto, and must never be
// imported into a client component.

import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { investorAccounts, type InvestorAccount } from "@/mocks/investors";
import { operatorAccounts } from "@/mocks/operators";

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

export interface Operator {
  id: string;
  name: string;
  username: string;
}

export type SessionUser = { role: "investor"; investor: PortalInvestor } | { role: "operator"; operator: Operator };

const toPortal = ({ id, name, username, payoutModel, payoutValue, machineIds }: InvestorAccount): PortalInvestor => ({
  id,
  name,
  username,
  payoutModel,
  payoutValue,
  machineIds,
});

/** The user for an account id, from either list; never exposes the password hash. */
function userById(id: string | undefined): SessionUser | null {
  const investor = investorAccounts.find((a) => a.id === id);
  if (investor) return { role: "investor", investor: toPortal(investor) };
  const op = operatorAccounts.find((a) => a.id === id);
  if (op) return { role: "operator", operator: { id: op.id, name: op.name, username: op.username } };
  return null;
}

/**
 * The key that signs sessions. AUTH_SECRET when set. Otherwise it's derived from
 * DATABASE_URL, a server-only secret every deployment already has; the HMAC with a
 * fixed label keeps the two keys separate. Local dev without either uses a fixed dev key.
 */
function secret(): string | null {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  const db = process.env.DATABASE_URL;
  if (db && db.length >= 16) return createHmac("sha256", db).update("vendai-investor-session-v1").digest("base64url");
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

/** The account for these credentials (investor or operator), or null. */
export function checkCredentials(username: string, password: string): SessionUser | null {
  const name = username.trim().toLowerCase();
  const account = [...investorAccounts, ...operatorAccounts].find((a) => a.username === name);
  const ok = passwordMatches(password, account?.passwordHash ?? DUMMY_HASH);
  return account && ok ? userById(account.id) : null;
}

const sign = (payload: string, key: string) => createHmac("sha256", key).update(payload).digest("base64url");

/** "<account id>.<expires epoch ms>.<signature>" */
export function createSessionToken(accountId: string): string {
  const key = secret();
  if (!key) throw new Error("AUTH_SECRET is not set");
  const payload = `${accountId}.${Date.now() + SESSION_HOURS * 3_600_000}`;
  return `${payload}.${sign(payload, key)}`;
}

function userFromToken(token: string | undefined): SessionUser | null {
  const key = secret();
  if (!token || !key) return null;
  const lastDot = token.lastIndexOf(".");
  const payload = token.slice(0, lastDot);
  const given = Buffer.from(token.slice(lastDot + 1));
  const expected = Buffer.from(sign(payload, key));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [accountId, expires] = payload.split(".");
  if (!expires || Number(expires) < Date.now()) return null;
  return userById(accountId);
}

/** The signed-in user, or null. Reads the request cookie: call it behind a <Suspense>. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  // The expiry check reads the clock, so it must run at request time, never in a prerender.
  await connection();
  return userFromToken(token);
}

export async function getCurrentInvestor(): Promise<PortalInvestor | null> {
  const user = await getCurrentUser();
  return user?.role === "investor" ? user.investor : null;
}

export async function getCurrentOperator(): Promise<Operator | null> {
  const user = await getCurrentUser();
  return user?.role === "operator" ? user.operator : null;
}

/** The signed-in investor, or a redirect to the login page that comes back to `next`. */
export async function requireInvestor(next: string): Promise<PortalInvestor> {
  const investor = await getCurrentInvestor();
  if (!investor) redirect(`/login?next=${encodeURIComponent(next)}`);
  return investor;
}

/** The signed-in operator. Investors go to their portal; everyone else to the login page. */
export async function requireOperator(next: string): Promise<Operator> {
  const user = await getCurrentUser();
  if (user?.role === "operator") return user.operator;
  if (user?.role === "investor") redirect("/owner");
  redirect(`/login?next=${encodeURIComponent(next)}`);
}

/**
 * Where to go after signing in, never off-site (no open redirects): investors only to
 * the portal, operators only to the dashboard.
 */
export function safeNext(next: unknown, role: SessionUser["role"]): string {
  const path = typeof next === "string" ? next : "";
  if (role === "investor") return /^\/owner(\/[A-Za-z0-9-]+(\/statement)?)?$/.test(path) ? path : "/owner";
  return /^\/(?!\/)(?!owner)[A-Za-z0-9/_-]*$/.test(path) ? path : "/";
}

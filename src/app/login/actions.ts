"use server";

// Sign in and out (investors and operators). Credentials are checked on the server; the
// browser only ever gets a signed, httpOnly session cookie.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkCredentials, createSessionToken, loginConfigured, safeNext, SESSION_COOKIE, SESSION_HOURS } from "@/lib/auth";

export interface LoginState {
  error: string | null;
  username: string;
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const username = String(form.get("username") ?? "").slice(0, 64);
  const password = String(form.get("password") ?? "").slice(0, 256);
  if (!username || !password) return { error: "Enter your username and password.", username };
  if (!loginConfigured()) return { error: "Login isn't set up on this server yet (AUTH_SECRET is missing).", username };

  const user = checkCredentials(username, password);
  if (!user) return { error: "That username and password don't match.", username };
  const accountId = user.role === "investor" ? user.investor.id : user.operator.id;

  (await cookies()).set(SESSION_COOKIE, createSessionToken(accountId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  redirect(safeNext(form.get("next"), user.role));
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

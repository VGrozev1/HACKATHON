"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";
import { login, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";

const initial: LoginState = { error: null, username: "" };

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initial);
  const next = useSearchParams().get("next") ?? "/owner";

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="text-base font-medium">Username</span>
        <input
          name="username"
          autoComplete="username"
          defaultValue={state.username}
          required
          autoFocus
          className="mt-1.5 h-12 w-full rounded-xl border bg-card px-4 text-base outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40"
        />
      </label>
      <label className="block">
        <span className="text-base font-medium">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1.5 h-12 w-full rounded-xl border bg-card px-4 text-base outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40"
        />
      </label>
      {state.error && (
        <p role="alert" className="rounded-lg bg-crit-soft px-4 py-2.5 text-base text-crit">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-12 w-full text-base">
        {pending ? <Loader2 className="animate-spin" /> : <LogIn />}
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

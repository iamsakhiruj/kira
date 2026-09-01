"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initial: LoginState = { error: "" };

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
          Email
        </span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className="h-11 rounded-card border px-3"
          style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
          Password
        </span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 rounded-card border px-3"
          style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}
        />
      </label>

      {state.error ? (
        <p
          role="alert"
          className="rounded-card px-3 py-2"
          style={{
            fontSize: "var(--text-label)",
            color: "var(--warn)",
            background: "var(--warn-bg)",
          }}
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-card font-medium"
        style={{
          background: "var(--brand)",
          color: "var(--on-brand)",
          opacity: pending ? 0.7 : 1,
        }}
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

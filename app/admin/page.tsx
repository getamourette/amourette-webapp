"use client";

// Founder-only admin dashboard. This route is deliberately NOT part of the
// anonymous public flow: it never calls ensureAnonSession(). Founders sign in
// with email/password, and the real enforcement is at the database — every
// query rides RLS that returns nothing unless private.is_admin() is true. The
// client gate below (am_i_admin RPC) only decides what to render; it is not the
// security boundary. Internal tooling, so English-only (no i18n dictionary).

import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ModerationQueue } from "@/app/admin/ModerationQueue";
import { VenueOps } from "@/app/admin/VenueOps";
import { Stats } from "@/app/admin/Stats";

type Gate = "loading" | "login" | "unauthorized" | "ready";
type Tab = "moderation" | "venues" | "stats";

const TABS: { id: Tab; label: string }[] = [
  { id: "stats", label: "Stats" },
  { id: "moderation", label: "Moderation" },
  { id: "venues", label: "Venues" },
];

export default function AdminPage() {
  const [gate, setGate] = useState<Gate>("loading");
  const [tab, setTab] = useState<Tab>("stats");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");

  // Resolve the gate from whatever session is already stored (a founder may have
  // an anonymous session from browsing the app — that resolves to "login").
  const resolveGate = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("am_i_admin");
    if (rpcError) {
      // No session / not callable → treat as needing login.
      return "login" as const;
    }
    return data ? ("ready" as const) : ("login" as const);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const next = await resolveGate();
      if (active) setGate(next);
    })();
    return () => {
      active = false;
    };
  }, [resolveGate]);

  async function handleSignIn(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSigningIn(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError("Sign-in failed. Check your email and password.");
        return;
      }
      const { data: isAdmin } = await supabase.rpc("am_i_admin");
      setPassword("");
      setGate(isAdmin ? "ready" : "unauthorized");
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setEmail("");
    setPassword("");
    setError("");
    setGate("login");
  }

  return (
    <main className="night-shell flex-1">
      <div className="night-content mx-auto w-full max-w-5xl px-5 py-10">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="night-kicker">Amourette</p>
            <h1 className="text-2xl font-black tracking-tight">Admin dashboard</h1>
          </div>
          {(gate === "ready" || gate === "unauthorized") && (
            <button
              type="button"
              onClick={handleSignOut}
              className="night-button night-button-secondary px-4 py-2 text-sm"
            >
              Sign out
            </button>
          )}
        </header>

        {gate === "loading" && <p className="night-muted">Loading…</p>}

        {gate === "login" && (
          <form
            onSubmit={handleSignIn}
            className="night-panel mx-auto mt-6 w-full max-w-sm rounded-3xl p-6"
          >
            <h2 className="mb-1 text-lg font-bold">Founder sign-in</h2>
            <p className="night-muted mb-5 text-sm">
              This area is restricted to Amourette founders.
            </p>
            <label className="mb-1 block text-sm font-semibold">Email</label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="night-input mb-4 px-4 py-3"
            />
            <label className="mb-1 block text-sm font-semibold">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="night-input mb-5 px-4 py-3"
            />
            {error && <p className="mb-4 text-sm text-red-300">{error}</p>}
            <button
              type="submit"
              disabled={signingIn}
              className="night-button night-button-primary w-full px-4 py-3 disabled:opacity-60"
            >
              {signingIn ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}

        {gate === "unauthorized" && (
          <div className="night-panel mx-auto mt-6 w-full max-w-sm rounded-3xl p-6 text-center">
            <h2 className="mb-2 text-lg font-bold">Not authorized</h2>
            <p className="night-muted text-sm">
              This account is signed in but is not a founder. Sign out and use a
              founder account.
            </p>
          </div>
        )}

        {gate === "ready" && (
          <>
            <nav className="mb-6 flex gap-2">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`night-button px-4 py-2 text-sm ${
                    tab === item.id
                      ? "night-button-primary"
                      : "night-button-secondary"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            {tab === "moderation" && <ModerationQueue />}
            {tab === "venues" && <VenueOps />}
            {tab === "stats" && <Stats />}
          </>
        )}
      </div>
    </main>
  );
}

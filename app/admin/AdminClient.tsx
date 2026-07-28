"use client";

// Founder-only admin dashboard. This route is deliberately NOT part of the
// anonymous public flow: it never calls ensureAnonSession(). Founders sign in
// with email/password, and the real enforcement is at the database — every
// query rides RLS that returns nothing unless private.is_admin() is true. The
// client gate below (am_i_admin RPC) only decides what to render; it is not the
// security boundary. Internal tooling, so English-only (no i18n dictionary).

import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ModerationQueue } from "@/app/admin/ModerationQueue";
import { VenueWorkspace } from "@/app/admin/VenueWorkspace";
import { Stats } from "@/app/admin/Stats";

type Gate = "loading" | "login" | "unauthorized" | "ready";
type Tab = "moderation" | "venues" | "stats";

const TABS: { id: Tab; label: string; phase: string }[] = [
  { id: "venues", label: "Venues", phase: "1 · Prepare" },
  { id: "stats", label: "Stats", phase: "2 · Monitor" },
  { id: "moderation", label: "Moderation", phase: "3 · Intervene" },
];

function TabIcon({ tab }: { tab: Tab }) {
  const paths: Record<Tab, ReactNode> = {
    stats: <><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/></>,
    moderation: <><path d="M10 3 4 6v5c0 4 2.5 7 6 8 3.5-1 6-4 6-8V6l-6-3Z"/><path d="m7.5 11 1.7 1.7 3.5-3.7"/></>,
    venues: <><path d="M3 9h14"/><path d="M5 9V6h10v3"/><path d="M5 9v8h10V9"/><path d="M8 17v-4h4v4"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[tab]}</svg>;
}

export default function AdminPage() {
  const [gate, setGate] = useState<Gate>("loading");
  const [tab, setTab] = useState<Tab>("venues");

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
    <main className="admin-shell night-shell flex-1">
      <div className="night-content mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
        <header className="admin-topbar mb-9 flex flex-wrap items-center gap-4 px-4 py-3 sm:px-5">
          <div className="mr-auto min-w-fit">
            <p className="night-kicker">Amourette</p>
            <h1 className="text-base font-bold tracking-tight">Control center</h1>
          </div>
          {gate === "ready" && (
            <nav className="admin-navigation order-3 flex w-full gap-1 sm:order-none sm:w-auto">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  aria-current={tab === item.id ? "page" : undefined}
                  className={`admin-nav-item inline-flex flex-1 items-center justify-center gap-2 px-3 py-2 text-sm sm:flex-none ${tab === item.id ? "is-active" : ""}`}
                >
                  <TabIcon tab={item.id} />
                  <span className="text-left leading-tight">
                    <span className="block">{item.label}</span>
                    <span className="admin-nav-phase block">{item.phase}</span>
                  </span>
                </button>
              ))}
            </nav>
          )}
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
            {tab === "moderation" && <ModerationQueue />}
            {tab === "venues" && <VenueWorkspace />}
            {tab === "stats" && <Stats />}
          </>
        )}
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { PasswordFields } from "@/app/admin/PasswordFields";
import { supabase } from "@/lib/supabase";

type RecoveryGate = "loading" | "invalid" | "unauthorized" | "ready" | "done";

export default function ResetPasswordClient() {
  const [gate, setGate] = useState<RecoveryGate>("loading");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        if (active) setGate("invalid");
        return;
      }

      const { data: isAdmin, error: adminError } = await supabase.rpc("am_i_admin");
      if (!active) return;

      if (adminError || !isAdmin) {
        await supabase.auth.signOut();
        if (active) setGate("unauthorized");
        return;
      }

      setGate("ready");
    })();

    return () => {
      active = false;
    };
  }, []);

  async function handleReset(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      await supabase.auth.signOut();
      setPassword("");
      setConfirmation("");
      setGate("done");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="night-shell flex-1">
      <div className="night-content mx-auto w-full max-w-sm px-5 py-10">
        <header className="mb-8">
          <p className="night-kicker">Amourette</p>
          <h1 className="text-2xl font-black tracking-tight">Reset admin password</h1>
        </header>

        <section className="night-panel rounded-3xl p-6">
          {gate === "loading" && <p className="night-muted">Checking recovery link…</p>}

          {gate === "invalid" && (
            <>
              <h2 className="text-lg font-bold">Recovery link unavailable</h2>
              <p className="night-muted mt-2 text-sm">
                This link is invalid or has expired. Request a new one from the admin
                sign-in page.
              </p>
              <Link
                href="/admin"
                className="night-button night-button-primary mt-6 block px-4 py-3 text-center"
              >
                Return to admin sign-in
              </Link>
            </>
          )}

          {gate === "unauthorized" && (
            <>
              <h2 className="text-lg font-bold">Not authorized</h2>
              <p className="night-muted mt-2 text-sm">
                Password recovery is restricted to founder accounts.
              </p>
              <Link
                href="/admin"
                className="night-button night-button-primary mt-6 block px-4 py-3 text-center"
              >
                Return to admin sign-in
              </Link>
            </>
          )}

          {gate === "ready" && (
            <form onSubmit={handleReset}>
              <h2 className="mb-1 text-lg font-bold">Choose a new password</h2>
              <p className="night-muted mb-5 text-sm">
                Updating it signs out every existing admin session.
              </p>
              <PasswordFields
                password={password}
                confirmation={confirmation}
                onPasswordChange={setPassword}
                onConfirmationChange={setConfirmation}
              />
              {error && <p className="mb-4 text-sm text-blush">{error}</p>}
              <button
                type="submit"
                disabled={saving}
                className="night-button night-button-primary w-full px-4 py-3 disabled:opacity-60"
              >
                {saving ? "Updating…" : "Update password"}
              </button>
            </form>
          )}

          {gate === "done" && (
            <>
              <h2 className="text-lg font-bold">Password updated</h2>
              <p className="night-muted mt-2 text-sm">
                Sign in again with your new password.
              </p>
              <Link
                href="/admin"
                className="night-button night-button-primary mt-6 block px-4 py-3 text-center"
              >
                Continue to admin sign-in
              </Link>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

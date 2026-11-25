"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { normalizeTotpCode, verifyTotpCode } from "@/lib/admin-two-factor";

// Founder second factor (#374). Supabase Auth generates and stores the TOTP
// secret; it is shown once here so the founder can add it to authenticator
// apps, and is never logged, stored or sent anywhere else.

const INVALID_CODE = "That code did not work. Enter the newest 6-digit code from your authenticator app.";
const UNAVAILABLE = "Your session could not be checked. Sign in again.";

export function TotpCodeField({ value, onChange, id = "totp-code" }: {
  value: string; onChange: (value: string) => void; id?: string;
}) {
  return <>
    <label htmlFor={id} className="mb-1 block text-sm font-semibold">Authenticator code</label>
    <input id={id} type="text" inputMode="numeric" autoComplete="one-time-code" required
      maxLength={7} pattern="[0-9 ]*" spellCheck={false} autoCorrect="off" autoCapitalize="off"
      value={value} onChange={(event) => onChange(event.target.value)}
      className="night-input mb-4 px-4 py-3 tracking-[0.3em]" />
  </>;
}

// Verifies a code against the account's authenticators. Returns an error
// message, or null once the session is aal2.
export async function submitTotpCode(raw: string): Promise<string | null> {
  const code = normalizeTotpCode(raw);
  if (!code) return "Enter the 6-digit code from your authenticator app.";
  const result = await verifyTotpCode(supabase.auth, code);
  if (result === "verified") return null;
  return result === "invalid" ? INVALID_CODE : UNAVAILABLE;
}

export function TwoFactorChallenge({ onVerified, onSignOut, framed = true }: {
  onVerified: () => void; onSignOut: () => void; framed?: boolean;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const failure = await submitTotpCode(code);
      if (failure) { setError(failure); return; }
      setCode("");
      onVerified();
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={handleSubmit} className={framed ? "night-panel mx-auto mt-6 w-full max-w-sm rounded-3xl p-6" : undefined}>
    <h2 className="mb-1 text-lg font-bold">Two-step sign-in</h2>
    <p className="night-muted mb-5 text-sm">Open your authenticator app and enter the code for Amourette.</p>
    <TotpCodeField value={code} onChange={setCode} />
    {error && <p className="mb-4 text-sm text-blush" role="alert">{error}</p>}
    <button type="submit" disabled={busy} className="night-button night-button-primary w-full px-4 py-3 disabled:opacity-60">
      {busy ? "Checking…" : "Verify"}
    </button>
    <button type="button" onClick={onSignOut} className="night-button mt-3 w-full px-4 py-2 text-sm text-taupe">
      Use another account
    </button>
  </form>;
}

type Enrollment = { factorId: string; qrCode: string; secret: string };

// Starts a TOTP enrollment, shows the QR code and the secret, and verifies the
// first code. An unfinished earlier attempt is removed first: Supabase refuses
// a second unverified factor with the same name and keeps the stale one.
export function TwoFactorSetup({ required, onDone, onCancel }: {
  required: boolean; onDone: () => void; onCancel: () => void;
}) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const listed = await supabase.auth.mfa.listFactors();
      for (const factor of listed.data?.all ?? []) {
        if (factor.factor_type === "totp" && factor.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp", issuer: "Amourette",
        friendlyName: `Authenticator ${new Date().toISOString().slice(0, 16)} ${Math.random().toString(36).slice(2, 6)}`,
      });
      if (!active) return;
      if (enrollError || !data) { setError("Two-step sign-in could not be started. Try again shortly."); return; }
      setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    })();
    return () => { active = false; };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!enrollment) return;
    setError("");
    const normalized = normalizeTotpCode(code);
    if (!normalized) { setError("Enter the 6-digit code from your authenticator app."); return; }
    setBusy(true);
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.factorId, code: normalized });
      if (verifyError) { setError(INVALID_CODE); return; }
      setEnrollment(null);
      setCode("");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={handleSubmit}>
    <h2 id="two-factor-title" className="mb-1 pr-10 text-lg font-bold">Set up two-step sign-in</h2>
    <p className="night-muted mb-4 text-sm">
      {required
        ? "Founder access needs a code from an authenticator app as well as your password."
        : "After this, signing in asks for a code from your authenticator app as well as your password."}
    </p>
    <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm">
      <li>Scan this code with an authenticator app (Apple Passwords, Google Authenticator, 1Password…).</li>
      <li><strong>Scan it on a second device too</strong> (a tablet or your password manager). If you lose your phone, the other one still signs you in.</li>
      <li>Enter the 6-digit code it shows.</li>
    </ol>
    {enrollment ? <>
      {/* Supabase returns the QR code as an SVG data URL; nothing leaves the page. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={enrollment.qrCode} alt="QR code to add Amourette to an authenticator app" width={180} height={180}
        data-testid="totp-qr" className="mx-auto mb-3 rounded-xl bg-white p-2" />
      <button type="button" className="night-button mb-3 w-full px-4 py-2 text-sm" onClick={() => setShowSecret(value => !value)}>
        {showSecret ? "Hide setup key" : "Can't scan? Show the setup key"}
      </button>
      {showSecret && <p className="mb-4 break-all rounded-xl bg-black/20 p-3 text-center font-mono text-sm" data-testid="totp-secret">{enrollment.secret}</p>}
      <TotpCodeField value={code} onChange={setCode} id="totp-setup-code" />
    </> : !error && <p className="night-muted mb-4 text-sm">Preparing…</p>}
    {error && <p className="mb-4 text-sm text-blush" role="alert">{error}</p>}
    <button type="submit" disabled={busy || !enrollment} className="night-button night-button-primary w-full px-4 py-3 disabled:opacity-60">
      {busy ? "Checking…" : "Turn on two-step sign-in"}
    </button>
    <button type="button" onClick={onCancel} disabled={busy} className="night-button mt-3 w-full px-4 py-2 text-sm text-taupe">
      {required ? "Use another account" : "Not now"}
    </button>
  </form>;
}

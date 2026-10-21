"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, CalendarDays, MapPin, Shield, ChartNoAxesColumn, MessageCircle } from "lucide-react";
import { useLiveNight } from "./useLiveNight";
import styles from "./AdminShell.module.css";

import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PasswordFields } from "@/app/admin/PasswordFields";
import { Modal } from "@/components/ui/modal";

// Founder-only admin dashboard. This route is deliberately NOT part of the
// anonymous public flow: it never calls ensureAnonSession(). Founders sign in
// with email/password, and the real enforcement is at the database — every
// query rides RLS that returns nothing unless private.is_admin() is true. The
// client gate below (am_i_admin RPC) only decides what to render; it is not the
// security boundary. Internal tooling, so English-only (no i18n dictionary).

type Gate = "loading" | "login" | "unauthorized" | "ready";
const NAVIGATION = [
  { href: "/admin/tonight", label: "Tonight", icon: Moon },
  { href: "/admin", label: "Nights", icon: CalendarDays },
  { href: "/admin/venues", label: "Venues", icon: MapPin },
  { href: "/admin/moderation", label: "Moderation", icon: Shield },
  { href: "/admin/stats", label: "Stats", icon: ChartNoAxesColumn },
  { href: "/admin/feedback", label: "Feedback", icon: MessageCircle },
];

function MobileAccount({ canChangePassword, onChangePassword, onSignOut }: {
  canChangePassword: boolean; onChangePassword: () => void; onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    const onHistoryChange = () => setOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("popstate", onHistoryChange);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("popstate", onHistoryChange);
    };
  }, [open]);

  return <div ref={container} className={styles.mobileAccount}>
    <button ref={trigger} type="button" className={styles.accountTrigger}
      aria-expanded={open} aria-controls="admin-account-panel" onClick={() => setOpen(value => !value)}>Account</button>
    {open && <div id="admin-account-panel" className={styles.accountPopover}>
      {canChangePassword && <button type="button" onClick={() => { setOpen(false); onChangePassword(); }}>Change password</button>}
      <button type="button" onClick={() => { setOpen(false); onSignOut(); }}>Sign out</button>
    </div>}
  </div>;
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [gate, setGate] = useState<Gate>("loading");
  const live = useLiveNight(gate === "ready");
  const navigation = useRef<HTMLElement>(null);
  const [moreNavigation, setMoreNavigation] = useState(false);

  useEffect(() => {
    const element = navigation.current;
    if (!element) return;
    const update = () => setMoreNavigation(element.scrollWidth - element.clientWidth - element.scrollLeft > 1);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    for (const link of element.children) observer.observe(link);
    element.addEventListener("scroll", update, { passive: true });
    return () => { observer.disconnect(); element.removeEventListener("scroll", update); };
  }, [gate]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  const [recoverySent, setRecoverySent] = useState(false);
  const [sendingRecovery, setSendingRecovery] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

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

  async function handleRecoveryRequest() {
    setError("");
    setRecoverySent(false);
    const recoveryEmail = email.trim();
    if (!recoveryEmail) {
      setError("Enter your founder email first.");
      return;
    }

    setSendingRecovery(true);
    try {
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(
        recoveryEmail,
        { redirectTo: `${window.location.origin}/admin/reset-password` },
      );
      if (recoveryError) {
        setError("The recovery email could not be sent. Try again shortly.");
        return;
      }
      setRecoverySent(true);
    } finally {
      setSendingRecovery(false);
    }
  }

  function closePasswordChange() {
    setChangingPassword(false);
    setCurrentPassword("");
    setNewPassword("");
    setPasswordConfirmation("");
    setPasswordError("");
  }

  async function handlePasswordChange(event: FormEvent) {
    event.preventDefault();
    setPasswordError("");

    if (Array.from(newPassword).length < 12) {
      setPasswordError("Use at least 12 characters for your new password.");
      return;
    }

    if (newPassword !== passwordConfirmation) {
      setPasswordError("The passwords do not match.");
      return;
    }

    setSavingPassword(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user?.email) {
        setPasswordError("Your session could not be verified. Sign in again.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInError) {
        setPasswordError("The current password is incorrect.");
        return;
      }

      const { data: isAdmin, error: adminError } = await supabase.rpc("am_i_admin");
      if (adminError || !isAdmin) {
        setPasswordError("This account is not authorized.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        setPasswordError(updateError.message);
        return;
      }

      await supabase.auth.signOut();
      closePasswordChange();
      setEmail("");
      setPassword("");
      setGate("login");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className={`admin-shell ${styles.shell}`}>
      <aside className={styles.sidebar}>
        <div className={styles.brandRow}>
          <div className={styles.brand}><strong>Amourette</strong><span>Founder admin</span></div>
          {(gate === "ready" || gate === "unauthorized") && (
            <MobileAccount key={pathname} canChangePassword={gate === "ready"}
              onChangePassword={() => setChangingPassword(true)} onSignOut={() => void handleSignOut()} />
          )}
        </div>
        {gate === "ready" && (
          <div className={styles.navigationFrame} data-overflow-right={moreNavigation}>
            <nav ref={navigation} className={styles.navigation} aria-label="Admin">
              {NAVIGATION.map(({ href, label, icon: Icon }) => {
                const active = href === "/admin"
                  ? pathname === href || pathname.startsWith("/admin/nights/")
                  : pathname === href || pathname.startsWith(`${href}/`);
                return <Link key={href} href={href} aria-current={active ? "page" : undefined}>
                  <Icon size={17} aria-hidden="true" /><span>{label}</span>{href === "/admin/tonight" && live && <span className={styles.live}>Live</span>}
                </Link>;
              })}
            </nav>
          </div>
        )}
        {(gate === "ready" || gate === "unauthorized") && (
          <div className={styles.account}>
            {gate === "ready" && <button type="button" onClick={() => setChangingPassword(true)}>Change password</button>}
            <button type="button" onClick={handleSignOut}>Sign out</button>
          </div>
        )}
      </aside>
      <main className={styles.content}>
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
            <label htmlFor="founder-email" className="mb-1 block text-sm font-semibold">Email</label>
            <input
              id="founder-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="night-input mb-4 px-4 py-3"
            />
            <label htmlFor="founder-password" className="mb-1 block text-sm font-semibold">Password</label>
            <input
              id="founder-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="night-input mb-5 px-4 py-3"
            />
            {error && <p className="mb-4 text-sm text-blush">{error}</p>}
            {recoverySent && (
              <p className="mb-4 text-sm text-cream">
                If this is a founder account, a recovery link has been sent.
              </p>
            )}
            <button
              type="submit"
              disabled={signingIn}
              className="night-button night-button-primary w-full px-4 py-3 disabled:opacity-60"
            >
              {signingIn ? "Signing in…" : "Sign in"}
            </button>
            <button
              type="button"
              disabled={sendingRecovery}
              onClick={() => void handleRecoveryRequest()}
              className="night-button mt-3 w-full px-4 py-2 text-sm text-taupe disabled:opacity-60"
            >
              {sendingRecovery ? "Sending…" : "Forgot password?"}
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

        {gate === "ready" && children}
      </main>

      {changingPassword && (
        <Modal
          onClose={closePasswordChange}
          dismissable={!savingPassword}
          labelledById="change-password-title"
          overlayClassName="admin-modal-overlay"
        >
          <form onSubmit={handlePasswordChange}>
            <h2 id="change-password-title" className="mb-1 pr-10 text-lg font-bold">
              Change password
            </h2>
            <p className="night-muted mb-5 text-sm">
              Confirm your current password. Updating it signs out every existing
              admin session.
            </p>
            <label
              htmlFor="current-password"
              className="mb-1 block text-sm font-semibold"
            >
              Current password
            </label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="night-input mb-4 px-4 py-3"
            />
            <PasswordFields
              password={newPassword}
              confirmation={passwordConfirmation}
              onPasswordChange={setNewPassword}
              onConfirmationChange={setPasswordConfirmation}
            />
            {passwordError && (
              <p className="mb-4 text-sm text-blush">{passwordError}</p>
            )}
            <button
              type="submit"
              disabled={savingPassword}
              className="night-button night-button-primary w-full px-4 py-3 disabled:opacity-60"
            >
              {savingPassword ? "Updating…" : "Update password"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

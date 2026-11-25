"use client";

import { useCallback, useEffect, useState } from "react";
import { MailWarning } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isRecord, isUuid } from "@/lib/input-validation";
import { isLaunchMailKind, type LaunchMailKind } from "@/lib/launch-mail";
import { formatVenueInstant } from "@/lib/venue-time";
import styles from "./AdminShell.module.css";

// #489: a broken Resend setup must not fail silently while guests keep paying.
// The shell polls the reservation emails that did not go out, next to the report
// alert (#503), on every admin screen. Retrying mails leave by themselves once
// the setup works; a stopped one goes out again only on a founder resend.
const POLL_MS = 30_000;

export type MailProblem = {
  id: string; kind: LaunchMailKind; state: "failed" | "unknown"; attempts: number;
  first_name: string; venue_name: string; timezone: string; starts_at: string;
};

const kindLabels: Record<LaunchMailKind, string> = {
  confirmed_access: "Confirmation with QR", recovery: "Access link", participant_cancelled: "Cancellation",
  event_cancelled: "Event cancelled", event_postponed: "Event postponed", refund_succeeded: "Refund",
  corrected_summary: "Corrected booking",
};

function isMailProblem(value: unknown): value is MailProblem {
  return isRecord(value) && isUuid(value.id) && isLaunchMailKind(value.kind) && (value.state === "failed" || value.state === "unknown") &&
    Number.isSafeInteger(value.attempts) && typeof value.first_name === "string" && typeof value.venue_name === "string" &&
    typeof value.timezone === "string" && typeof value.starts_at === "string" && Number.isFinite(Date.parse(value.starts_at));
}

// The server sends the exact total and at most the first 50 emails.
export type MailProblems = { total: number; items: MailProblem[] };

function isMailProblems(value: unknown): value is MailProblems {
  return isRecord(value) && Number.isSafeInteger(value.total) && Number(value.total) >= 0 && Array.isArray(value.items) &&
    value.items.length <= 50 && value.items.length <= Number(value.total) && value.items.every(isMailProblem);
}

export function useMailProblems(enabled: boolean) {
  const [problems, setProblems] = useState<MailProblems | null>(null);
  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_launch_mail_problems");
    // A failed or malformed read keeps the last known list: never hide an alert on a blip.
    if (!error && isMailProblems(data)) setProblems(data);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const poll = () => { if (!document.hidden) void refresh(); };
    const first = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(poll, POLL_MS);
    window.addEventListener("focus", poll);
    document.addEventListener("visibilitychange", poll);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener("focus", poll);
      document.removeEventListener("visibilitychange", poll);
      setProblems(null);
    };
  }, [enabled, refresh]);
  return { problems: enabled ? problems : null, refresh };
}

export function MailAlert({ problems, refresh }: { problems: MailProblems | null; refresh: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  if (!problems?.total) return null;
  const resend = async (id: string) => {
    setBusy(id); setError("");
    const { error } = await supabase.rpc("admin_resend_launch_mail", { p_id: id });
    if (error) setError("This email could not be resent. Refresh and try again.");
    await refresh();
    setBusy(null);
  };
  const count = problems.total;
  return <div role="alert" className={`${styles.reportAlert} ${styles.mailAlert}`}>
    <MailWarning size={18} aria-hidden="true" />
    <span>{count === 1 ? "1 reservation email not delivered" : `${count} reservation emails not delivered`}</span>
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? "Hide" : "Review"}</button>
    {open && <div className={styles.mailPanel}>
      <p>Emails retry every 2 minutes for 23 hours. Fix the Resend setup (API key, sending domain) and they leave on their own. A stopped email goes out again only when you resend it.</p>
      {error && <p role="status">{error}</p>}
      <ul>
        {problems.items.map(problem => <li key={problem.id}>
          <div>
            <strong>{problem.first_name}</strong> · {kindLabels[problem.kind]}
            <small>{problem.venue_name} · {formatVenueInstant(problem.starts_at, problem.timezone)}</small>
            <small>{problem.state === "failed" ? `Retrying automatically (attempt ${problem.attempts})` : "Stopped"}</small>
          </div>
          {problem.state === "unknown" && <button type="button" disabled={busy !== null} onClick={() => void resend(problem.id)}>
            {busy === problem.id ? "Resending…" : "Resend"}
          </button>}
        </li>)}
      </ul>
      {count > problems.items.length && <p>Showing the oldest {problems.items.length}. Resend or fix the setup to see the rest.</p>}
    </div>}
  </div>;
}

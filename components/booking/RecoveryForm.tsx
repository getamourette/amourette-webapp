"use client";
import { useState, type FormEvent } from "react";
import type { Locale } from "@/lib/strings";
import { isValidEmail } from "@/lib/input-validation";
import { bookingStrings } from "@/lib/booking-strings";
import { bookingRequest, BookingError } from "@/lib/booking-client";
import styles from "./booking.module.css";
export function RecoveryForm({ night, locale }: { night: string; locale: Locale }) {
  const s = bookingStrings[locale];
  const [email, setEmail] = useState(""); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false); const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy) return;
    if (!isValidEmail(email)) { setError(s.invalid); return; }
    setBusy(true); setError("");
    try { await bookingRequest("access", { action: "request", night, email }); setSent(true); }
    catch (e) { setError(e instanceof BookingError && e.status === 429 ? s.rate : s.error); }
    finally { setBusy(false); }
  }
  return <details className={styles.recovery}><summary>{s.recover}</summary>{sent ? <p role="status" className={styles.notice}>{s.recoverySent}</p> :
    <form className={styles.form} onSubmit={submit} noValidate><p className={styles.note}>{s.recoverHelp}</p><label className={styles.field}>{s.email}<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      {error && <p role="alert" className={styles.error}>{error}</p>}<button disabled={busy} className={`${styles.button} ${styles.secondary}`}>{busy ? s.submitting : s.recover}</button></form>}</details>;
}

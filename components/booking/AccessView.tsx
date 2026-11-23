"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { type Locale } from "@/lib/strings";
import { isRecord, isUuid } from "@/lib/input-validation";
import { bookingStrings } from "@/lib/booking-strings";
import { bookingRequest, BookingError } from "@/lib/booking-client";
import { storeBooking } from "@/lib/booking-storage";
import { bookingLocale } from "@/lib/booking-storage";
import { BookingShell } from "./BookingShell";
import styles from "./booking.module.css";
type Proof = { id: string; token: string };
export function AccessView() {
  const router = useRouter(); const read = useRef(false); const [locale, setLocale] = useState<Locale>("en"); const s = bookingStrings[locale];
  // "opening" is the automatic exchange (#405); "manual" keeps the button as the fallback when it fails.
  const [phase, setPhase] = useState<"reading" | "opening" | "manual" | "missing">("reading");
  const [proof, setProof] = useState<Proof | null>(null); const busyRef = useRef(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function open(proof: Proof, text: typeof s) {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setError("");
    try {
      // Confirm that secure browser storage works before rotating the credential.
      const probe = "amourette-reservation-probe";
      try { sessionStorage.setItem(probe, "ok"); if (sessionStorage.getItem(probe) !== "ok") throw new Error(); sessionStorage.removeItem(probe); }
      catch { setError(text.storage); setPhase("manual"); return; }
      const result = await bookingRequest("access", { action: "exchange", ...proof });
      if (!isRecord(result) || !isUuid(result.id) || typeof result.access !== "string") throw new Error();
      storeBooking({ id: result.id, access: result.access, expires: Date.now() + 7 * 86400000 });
      router.replace(`/reservations/${result.id}`);
    } catch (e) { setError(e instanceof BookingError && e.status === 401 ? text.accessExpired : e instanceof BookingError && e.status === 429 ? text.rate : text.error); setPhase("manual"); }
    finally { busyRef.current = false; setBusy(false); }
  }
  useEffect(() => {
    if (read.current) return; read.current = true;
    const raw = window.location.hash.slice(1); window.history.replaceState(null, "", window.location.pathname);
    Promise.resolve().then(() => {
      const locale = bookingLocale(); setLocale(locale);
      const parts = raw.split(".");
      if (!(parts.length === 2 && isUuid(parts[0]) && /^[a-f0-9]{64}$/.test(parts[1]))) { setPhase("missing"); return; }
      const value = { id: parts[0], token: parts[1] }; setProof(value); setPhase("opening");
      // The exchange stays a script-issued POST, so a mail scanner or link preview that only
      // fetches the page still does nothing. It also waits for a visible document: a page
      // prerendered or opened in the background by a prefetcher rotates no credential.
      const start = () => {
        if (document.visibilityState !== "visible") return;
        document.removeEventListener("visibilitychange", start); void open(value, bookingStrings[locale]);
      };
      document.addEventListener("visibilitychange", start); start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once: the fragment is read and removed on load.
  }, []);
  return <BookingShell locale={locale} setLocale={setLocale}><section className="max-w-lg"><h1 className={styles.title}>{s.reservation}</h1>
    {phase === "opening" && <p role="status" className={styles.lead}>{s.opening}</p>}
    {phase === "manual" && <p className={styles.lead}>{s.accessIntro}</p>}
    {phase === "missing" && <p className={styles.lead}>{s.accessExpired}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {phase === "manual" && proof && <button className={`${styles.button} mt-6`} disabled={busy} aria-busy={busy} onClick={() => void open(proof, s)}>{busy ? s.submitting : s.openAccess}</button>}
    {(phase === "manual" || phase === "missing") && <p className={styles.note}>{s.recoveryEntry}</p>}
  </section></BookingShell>;
}

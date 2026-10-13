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
export function AccessView() {
  const router = useRouter(); const read = useRef(false); const [locale, setLocale] = useState<Locale>("en"); const s = bookingStrings[locale];
  const [proof, setProof] = useState<{ id: string; token: string } | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => {
    if (read.current) return; read.current = true;
    const raw = window.location.hash.slice(1); window.history.replaceState(null, "", window.location.pathname);
    Promise.resolve().then(() => {
      setLocale(bookingLocale());
      const parts = raw.split(".");
      if (parts.length === 2 && isUuid(parts[0]) && /^[a-f0-9]{64}$/.test(parts[1])) setProof({ id: parts[0], token: parts[1] });
    });
  }, []);
  async function open() {
    if (!proof || busy) return; setBusy(true); setError("");
    try {
      // Confirm that secure browser storage works before rotating the credential.
      const probe = "amourette-reservation-probe";
      try { sessionStorage.setItem(probe, "ok"); if (sessionStorage.getItem(probe) !== "ok") throw new Error(); sessionStorage.removeItem(probe); }
      catch { setError(s.storage); return; }
      const result = await bookingRequest("access", { action: "exchange", ...proof });
      if (!isRecord(result) || !isUuid(result.id) || typeof result.access !== "string") throw new Error();
      storeBooking({ id: result.id, access: result.access, expires: Date.now() + 7 * 86400000 });
      router.replace(`/reservations/${result.id}`);
    } catch (e) { setError(e instanceof BookingError && e.status === 401 ? s.accessExpired : e instanceof BookingError && e.status === 429 ? s.rate : s.error); }
    finally { setBusy(false); }
  }
  return <BookingShell locale={locale} setLocale={setLocale}><section className="max-w-lg"><h1 className={styles.title}>{s.reservation}</h1><p className={styles.lead}>{proof ? s.accessIntro : s.accessExpired}</p>
    {proof && <button className={styles.button} disabled={busy} onClick={() => void open()}>{busy ? s.submitting : s.openAccess}</button>}
    {error && <p role="alert" className={styles.error}>{error}</p>}<p className={styles.note}>{s.recoveryEntry}</p>
  </section></BookingShell>;
}

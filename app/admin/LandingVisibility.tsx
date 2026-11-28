"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "./ReservationOperations.module.css";

// getamourette.com shows the next upcoming night. A founder hides a night from it
// (a test night that starts sooner than the real one, for example) at any time;
// the night's own page stays reachable by its link.
export function LandingVisibility({ nightId }: { nightId: string }) {
  const [visible, setVisible] = useState<boolean | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_launch_landing_visible", { p_night: nightId });
    if (error || typeof data !== "boolean") { setError("The landing page setting could not load. Refresh to try again."); return; }
    setVisible(data); setError("");
  }, [nightId]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  async function set(next: boolean) {
    setBusy(true); setError("");
    const { error } = await supabase.rpc("admin_set_launch_landing_visibility", { p_night: nightId, p_visible: next });
    setBusy(false);
    if (error) { setError("The setting could not be saved. Try again."); return; }
    await load();
  }
  return <section className={styles.root} aria-label="Landing page"><h3>Landing page · {visible === null ? "…" : visible ? "Shown" : "Hidden"}</h3>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {visible !== null && <div className={styles.settings}>
      <p>getamourette.com shows the next upcoming night that is not hidden. Hiding this night keeps its booking page and its reservations as they are.</p>
      <button disabled={busy} onClick={() => void set(!visible)}>{visible ? "Hide from the landing page" : "Show on the landing page"}</button>
    </div>}
  </section>;
}

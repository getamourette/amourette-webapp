"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { VenueWorkspace } from "./VenueWorkspace";
import styles from "./NightsHome.module.css";

// Temporary bridge until the dedicated night dashboard replaces VenueWorkspace.
export function NightBridge({ nightId }: { nightId: string }) {
  const [result, setResult] = useState<{ venueId: string | null; failed: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await supabase.from("venue_nights")
        .select("id,venue_id").eq("id", nightId).limit(1);
      if (active) setResult({ venueId: data?.find(night => night.id === nightId)?.venue_id ?? null, failed: Boolean(error) });
    })();
    return () => { active = false; };
  }, [nightId, attempt]);

  if (!result) return <p role="status">Loading night…</p>;
  if (result.failed || !result.venueId) return <div className={styles.empty}>
    <h1>Night unavailable</h1>
    <p>{result.failed ? "This night could not be loaded. Try again." : "This night could not be found."}</p>
    {result.failed && <button className={styles.button} onClick={() => { setResult(null); setAttempt(value => value + 1); }}>Try again</button>}
    <Link className={styles.button} href="/admin">Back to Nights</Link>
  </div>;
  return <VenueWorkspace venueId={result.venueId} selectedNightId={nightId} />;
}

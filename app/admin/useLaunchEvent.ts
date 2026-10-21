"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { LaunchOverview } from "@/lib/launch-operations";

// One overview and refresh revision for every section of a night dashboard.
export function useLaunchEvent(nightId: string) {
  const [overview, setOverview] = useState<LaunchOverview | null>(null);
  const [revision, setRevision] = useState(0);
  const [settledRevision, setSettledRevision] = useState(-1);
  const [error, setError] = useState("");
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let active = true;
    void supabase.rpc("admin_launch_overview", { p_night: nightId }).then(({ data, error }) => {
      if (!active) return;
      setSettledRevision(revision);
      if (error || !data) { setError("Reservation operations could not load. Refresh to try again."); return; }
      setOverview(data as unknown as LaunchOverview); setError("");
    });
    return () => { active = false; };
  }, [nightId, revision]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);
  return { overview, revision, refresh, error, loading: settledRevision !== revision };
}

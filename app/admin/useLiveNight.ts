"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { groupWorkspaceNights, workspaceNightStatus } from "@/lib/admin-venue-workspace";

// One small shell read, shared by desktop/mobile navigation. No attendance,
// reservation or finance reads; refresh on focus and once a minute while visible.
export function useLiveNight(enabled: boolean) {
  const [liveUntil, setLiveUntil] = useState(0);
  const [now, setNow] = useState(0);
  const request = useRef(0);
  const load = useCallback(async () => {
    if (!enabled) return;
    const version = ++request.current;
    const time = Date.now();
    try {
      const { data, error } = await supabase.from("venue_nights")
        .select("id,status,waiting_opens_at,closes_at,opened_at,terminal_at,terminal_reason,venues!inner(is_test_venue)")
        .eq("status", "live").is("terminal_at", null).gt("closes_at", new Date(time).toISOString())
        .eq("venues.is_test_venue", false).order("closes_at", { ascending: false }).limit(1);
      if (version !== request.current) return;
      const live = error ? undefined : groupWorkspaceNights((data ?? []).filter(row => row.venues?.is_test_venue === false), time).active.find(row => workspaceNightStatus(row, time) === "Live");
      setLiveUntil(live ? Date.parse(live.closes_at) : 0); setNow(time);
    } catch { if (version === request.current) { setLiveUntil(0); setNow(time); } }
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const initial = window.setTimeout(() => void load(), 0);
    const requests = request;
    const refresh = () => { if (!document.hidden) void load(); };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("admin-night-changed", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { requests.current++; window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("admin-night-changed", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [enabled, load]);
  useEffect(() => {
    if (!enabled || liveUntil <= now) return;
    const timeout = window.setTimeout(() => setNow(Date.now()), Math.min(liveUntil - now, 2_147_483_647));
    return () => window.clearTimeout(timeout);
  }, [enabled, liveUntil, now]);
  return enabled && liveUntil > now;
}

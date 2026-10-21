"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type { WorkspaceNight } from "@/lib/admin-venue-workspace";
import type { Venue } from "./workspace-types";

export type DirectoryVenue = Venue & Pick<Database["public"]["Tables"]["venues"]["Row"], "address">;
export type VenueNight = WorkspaceNight & { id: string; venue_id: string };
type Snapshot = { venues: DirectoryVenue[]; nights: VenueNight[]; now: number };

export function useVenues(venueId?: string) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);
  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      let venues = supabase.from("venues").select("id,slug,name,city,timezone,is_test_venue,address").order("name");
      let nights = supabase.from("venue_nights").select("id,venue_id,waiting_opens_at,closes_at,opened_at,terminal_at,terminal_reason,status").order("waiting_opens_at");
      if (venueId) { venues = venues.eq("id", venueId).limit(1); nights = nights.eq("venue_id", venueId); }
      const [venueResult, nightResult] = await Promise.all([venues, nights]);
      if (version !== requestVersion.current) return;
      if (venueResult.error || nightResult.error) { setError(true); return; }
      setSnapshot({ venues: venueResult.data ?? [], nights: nightResult.data ?? [], now: Date.now() });
      setError(false);
    } catch { if (version === requestVersion.current) setError(true); }
  }, [venueId]);

  useEffect(() => {
    void (async () => { await load(); })();
    const requests = requestVersion;
    const onFocus = () => void load();
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    const channel = supabase.channel(`admin-venues-${venueId ?? "directory"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "venues", ...(venueId ? { filter: `id=eq.${venueId}` } : {}) }, onFocus)
      .on("postgres_changes", { event: "*", schema: "public", table: "venue_nights", ...(venueId ? { filter: `venue_id=eq.${venueId}` } : {}) }, onFocus)
      .subscribe(status => { if (status === "SUBSCRIBED") void load(); });
    const timer = window.setInterval(onVisible, 30_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      requests.current++;
      void supabase.removeChannel(channel);
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, venueId]);

  function updateVenue(venue: DirectoryVenue) {
    // An older refresh must not overwrite a successful command's result.
    requestVersion.current++;
    setSnapshot(current => current ? { ...current, venues: current.venues.map(row => row.id === venue.id ? venue : row) } : current);
  }
  return { snapshot, error, load, updateVenue };
}

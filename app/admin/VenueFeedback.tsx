"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type Feedback = Pick<Database["public"]["Tables"]["venue_feedback"]["Row"],
  "id" | "body" | "created_at" | "venue_night_id" | "profile_id">;

export function VenueFeedback() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [venueNames, setVenueNames] = useState<Record<string, string>>({});
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    void (async () => {
      const { data, error: feedbackError } = await supabase.from("venue_feedback")
        .select("id, body, created_at, venue_night_id, profile_id")
        .order("created_at", { ascending: false }).limit(100);
      if (!current) return;
      if (feedbackError) { setError("Could not load venue feedback."); return; }
      setItems(data ?? []);
      const nightIds = [...new Set((data ?? []).map((item) => item.venue_night_id))];
      const profileIds = [...new Set((data ?? []).map((item) => item.profile_id))];
      const [nights, profiles] = await Promise.all([
        nightIds.length ? supabase.from("venue_nights").select("id, venue_id").in("id", nightIds) : Promise.resolve({ data: [] }),
        profileIds.length ? supabase.from("profiles").select("id, first_name").in("id", profileIds) : Promise.resolve({ data: [] }),
      ]);
      if (!current) return;
      const venueIds = [...new Set((nights.data ?? []).map((night) => night.venue_id))];
      const venues = venueIds.length
        ? await supabase.from("venues").select("id, name").in("id", venueIds)
        : { data: [] };
      if (!current) return;
      const namesByVenue = Object.fromEntries((venues.data ?? []).map((venue) => [venue.id, venue.name]));
      setVenueNames(Object.fromEntries((nights.data ?? []).map((night) => [night.id, namesByVenue[night.venue_id] ?? night.venue_id])));
      setProfileNames(Object.fromEntries((profiles.data ?? []).map((profile) => [profile.id, profile.first_name])));
    })();
    return () => { current = false; };
  }, []);

  return <section className="space-y-5">
    <h2 className="font-display text-3xl text-cream">Venue feedback</h2>
    {error && <p role="alert" className="text-blush">{error}</p>}
    {!error && items.length === 0 && <p className="night-muted">No feedback yet.</p>}
    <ul className="space-y-4">
      {items.map((item) => <li key={item.id} className="night-panel p-5">
        <p className="font-label text-xs uppercase tracking-wider text-taupe">
          {venueNames[item.venue_night_id] ?? item.venue_night_id} · {profileNames[item.profile_id] ?? "Participant"} · {new Date(item.created_at).toLocaleString()}
        </p>
        <p className="mt-3 whitespace-pre-wrap break-words text-cream">{item.body}</p>
      </li>)}
    </ul>
  </section>;
}

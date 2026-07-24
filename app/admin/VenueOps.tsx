"use client";

// Venue ops — list/create venues, toggle live, and get each venue's QR. This is
// what a real night needs (it overlaps Bloc 5). is_live is never flipped by a
// raw UPDATE: start/stop goes through the set_venue_live() RPC so stopping also
// empties the room atomically. Profile preview is a founder-only test override
// for cold starts, and is reset when the room closes. Creating a venue uses the
// venues_insert_admin policy; new venues start dark (is_live=false) until a
// founder presses Start.

import { FormEvent, useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type Venue = Pick<
  Database["public"]["Tables"]["venues"]["Row"],
  | "id"
  | "slug"
  | "name"
  | "city"
  | "timezone"
  | "is_live"
  | "is_test_venue"
  | "profile_preview_enabled"
>;

const TIMEZONE_OPTIONS = [
  { value: "Europe/Paris", label: "Paris · Europe/Paris" },
  { value: "America/New_York", label: "New York · America/New_York" },
  { value: "Europe/London", label: "London · Europe/London" },
  { value: "Europe/Madrid", label: "Madrid · Europe/Madrid" },
  { value: "America/Los_Angeles", label: "Los Angeles · America/Los_Angeles" },
  { value: "UTC", label: "UTC" },
];

// Base origin for the check-in URL encoded in the QR. Defaults to the current
// origin (localhost in dev); set NEXT_PUBLIC_SITE_URL to the deployed URL before
// printing real QR codes.
function qrBase() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function VenueOps() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [qr, setQr] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [timezone, setTimezone] = useState("Europe/Paris");
  const [creating, setCreating] = useState(false);

  // setState only after the await so this is safe to call directly from the
  // mount effect (react-hooks/set-state-in-effect).
  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("venues")
      .select(
        "id, slug, name, city, timezone, is_live, is_test_venue, profile_preview_enabled"
      )
      .order("name");
    if (loadError) {
      setError("Could not load venues.");
    } else {
      setError("");
      setVenues(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function toggleLive(venue: Venue) {
    setBusyId(venue.id);
    setError("");
    setActionMessage("");
    const nextLive = !venue.is_live;
    const { error: rpcError } = await supabase.rpc("set_venue_live", {
      p_venue_id: venue.id,
      p_live: nextLive,
    });
    if (rpcError) {
      setError(
        `Could not ${venue.is_live ? "close" : "open"} ${venue.name}: ${
          rpcError.message
        }`
      );
    } else {
      setVenues((prev) =>
        prev.map((item) =>
          item.id === venue.id ? { ...item, is_live: nextLive } : item
        )
      );
      setActionMessage(
        nextLive
          ? `${venue.name} is open. Users can enter the room now.`
          : `${venue.name} is closed. New users cannot enter the room.`
      );
      await load();
    }
    setBusyId(null);
  }

  async function toggleProfilePreview(venue: Venue) {
    setBusyId(venue.id);
    setError("");
    setActionMessage("");
    const nextEnabled = !venue.profile_preview_enabled;
    const { error: rpcError } = await supabase.rpc("set_venue_profile_preview", {
      p_venue_id: venue.id,
      p_enabled: nextEnabled,
    });
    if (rpcError) {
      setError(
        `Could not ${nextEnabled ? "show" : "hide"} completed profiles for ${
          venue.name
        }: ${rpcError.message}`
      );
    } else {
      setVenues((prev) =>
        prev.map((item) =>
          item.id === venue.id
            ? { ...item, profile_preview_enabled: nextEnabled }
            : item
        )
      );
      setActionMessage(
        nextEnabled
          ? `${venue.name} will show completed profiles when the room feed is empty.`
          : `${venue.name} is back to the normal waiting flow.`
      );
      await load();
    }
    setBusyId(null);
  }

  async function showQr(venue: Venue) {
    if (qr[venue.id]) {
      setQr((prev) => {
        const next = { ...prev };
        delete next[venue.id];
        return next;
      });
      return;
    }
    const url = venueUrl(venue);
    const dataUrl = await QRCode.toDataURL(url, { width: 320, margin: 2 });
    setQr((prev) => ({ ...prev, [venue.id]: dataUrl }));
  }

  function venueUrl(venue: Venue) {
    return `${qrBase()}/v/${venue.slug}`;
  }

  async function copyVenueUrl(venue: Venue) {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(venueUrl(venue));
    setCopiedId(venue.id);
    window.setTimeout(() => setCopiedId(null), 1800);
  }

  async function createVenue(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError("");
    const { error: insertError } = await supabase.from("venues").insert({
      slug: slug.trim(),
      name: name.trim(),
      city: city.trim() || null,
      timezone: timezone.trim(),
    });
    if (insertError) {
      setError("Could not create venue. Check the slug is unique and lowercase.");
    } else {
      setSlug("");
      setName("");
      setCity("");
      setTimezone("Europe/Paris");
      await load();
    }
    setCreating(false);
  }

  const liveVenues = venues.filter((venue) => venue.is_live);
  const darkVenues = venues.filter((venue) => !venue.is_live);

  return (
    <div className="space-y-10">
      <section>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="night-kicker mb-2">Venue operations</p>
            <h2 className="text-2xl font-black tracking-tight">Rooms</h2>
          </div>
          <button
            type="button"
            onClick={load}
            className="night-button night-button-secondary px-3 py-1.5 text-xs"
          >
            Refresh
          </button>
        </div>
        {error && <p className="mb-3 text-sm text-red-300">{error}</p>}
        {actionMessage && (
          <p className="mb-3 text-sm font-medium text-blush">
            {actionMessage}
          </p>
        )}
        {loading ? (
          <p className="night-muted">Loading…</p>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="night-card rounded-2xl p-4">
                <p className="night-kicker mb-3">Total</p>
                <p className="text-3xl font-black">{venues.length}</p>
              </div>
              <div className="night-card rounded-2xl p-4">
                <p className="night-kicker mb-3">Live now</p>
                <p className="text-3xl font-black">{liveVenues.length}</p>
              </div>
              <div className="night-card rounded-2xl p-4">
                <p className="night-kicker mb-3">Dark</p>
                <p className="text-3xl font-black">{darkVenues.length}</p>
              </div>
            </div>

            <ul className="space-y-3">
              {venues.map((venue) => (
                <li key={venue.id} className="night-card rounded-2xl p-4">
                  <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-bold">{venue.name}</span>
                        <span
                          className={`night-pill rounded-full px-3 py-1 ${
                            venue.is_live ? "text-blush" : ""
                          }`}
                        >
                          {venue.is_live ? "Live" : "Dark"}
                        </span>
                        {venue.is_test_venue && (
                          <span className="night-pill rounded-full px-3 py-1 text-blush">
                            Test
                          </span>
                        )}
                        {venue.profile_preview_enabled && (
                          <span className="night-pill rounded-full px-3 py-1 text-blush">
                            Profile preview
                          </span>
                        )}
                      </div>
                      <div className="night-muted mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                        <span>/{venue.slug}</span>
                        {venue.city && <span>{venue.city}</span>}
                        <span>{venue.timezone}</span>
                      </div>
                      <p className="night-muted mt-3 break-all text-xs">
                        {venueUrl(venue)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <button
                        type="button"
                        onClick={() => copyVenueUrl(venue)}
                        className="night-button night-button-secondary px-3 py-2 text-xs"
                      >
                        {copiedId === venue.id ? "Copied" : "Copy link"}
                      </button>
                      <button
                        type="button"
                        onClick={() => showQr(venue)}
                        className="night-button night-button-secondary px-3 py-2 text-xs"
                      >
                        {qr[venue.id] ? "Hide QR" : "Show QR"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === venue.id}
                        onClick={() => toggleProfilePreview(venue)}
                        className="night-button night-button-secondary px-4 py-2 text-xs disabled:opacity-60"
                      >
                        {busyId === venue.id
                          ? "Working…"
                          : venue.profile_preview_enabled
                            ? "Hide completed profiles"
                            : "Show completed profiles to users"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === venue.id}
                        onClick={() => toggleLive(venue)}
                        className={`night-button px-4 py-2 text-xs disabled:opacity-60 ${
                          venue.is_live
                            ? "night-button-danger"
                            : "night-button-primary"
                        }`}
                      >
                        {busyId === venue.id
                          ? "Working…"
                          : venue.is_live
                            ? "Close room to users"
                            : "Open room to users"}
                      </button>
                    </div>
                  </div>

                  {qr[venue.id] && (
                    <div className="mt-5 grid gap-4 border-t border-champagne/10 pt-5 md:grid-cols-[auto_1fr] md:items-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qr[venue.id]}
                        alt={`QR for ${venue.name}`}
                        className="rounded-xl bg-white p-2"
                        width={180}
                        height={180}
                      />
                      <div>
                        <p className="font-semibold">Door-ready QR</p>
                        <p className="night-muted mt-1 text-sm">
                          Use this for the host stand, bar entrance, or printed
                          table card. The QR opens directly into this venue.
                        </p>
                        <a
                          href={qr[venue.id]}
                          download={`${venue.slug}.png`}
                          className="night-button night-button-secondary mt-4 inline-flex px-4 py-2 text-xs"
                        >
                          Download PNG
                        </a>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3">
          <p className="night-kicker mb-2">Setup</p>
          <h2 className="text-lg font-bold">Create venue</h2>
        </div>
        <form
          onSubmit={createVenue}
          className="night-panel grid gap-4 rounded-3xl p-6 sm:grid-cols-2"
        >
          <div>
            <label className="mb-1 block text-sm font-semibold">Slug</label>
            <input
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="le-comptoir"
              pattern="[a-z0-9-]+"
              title="Lowercase letters, numbers and hyphens only."
              className="night-input px-4 py-3"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Le Comptoir"
              className="night-input px-4 py-3"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">City</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Paris"
              className="night-input px-4 py-3"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">Timezone</label>
            <select
              required
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="night-input px-4 py-3"
            >
              {TIMEZONE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={creating}
              className="night-button night-button-primary px-5 py-3 disabled:opacity-60"
            >
              {creating ? "Creating…" : "Create venue (dark)"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

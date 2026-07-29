"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { launchFollowsEntry, productionVenueUrl } from "@/lib/admin-dashboard";
import {
  formatVenueInstant,
  isoToVenueLocalInput,
  resolveVenueLocalDateTime,
} from "@/lib/venue-time";

type Venue = Pick<
  Database["public"]["Tables"]["venues"]["Row"],
  "id" | "slug" | "name" | "city" | "timezone" | "is_test_venue"
>;
type Night = Database["public"]["Tables"]["venue_nights"]["Row"];
type Editor = { venue: Venue | null };

const ROLLOUT_LOCATIONS = [
  { city: "Paris", timezone: "Europe/Paris", label: "Paris time · Europe/Paris" },
  { city: "New York", timezone: "America/New_York", label: "New York time · America/New_York" },
] as const;

function statusOf(night: Night | null) {
  if (!night) return "No night scheduled";
  if (night.terminal_reason === "cancelled") return "Cancelled";
  if (night.terminal_at) return "Ended";
  if (night.status === "live") return "Live";
  if (night.status === "waiting") return "Waiting";
  if (night.opened_at) return "Paused";
  return "Scheduled";
}

function isNightLocked(night: Night | null) {
  return Boolean(
    night?.opened_at ||
      (night && Date.parse(night.waiting_opens_at) <= Date.now())
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function addCalendarDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return date.toISOString().slice(0, 10);
}

function after(previous: string, date: string, time: string) {
  let value = `${date}T${time}`;
  while (value <= previous) {
    date = addCalendarDay(date);
    value = `${date}T${time}`;
  }
  return value;
}

export function VenueWorkspace() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [nights, setNights] = useState<Night[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editingNight, setEditingNight] = useState<Night | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [deletingNight, setDeletingNight] = useState<Night | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [timezone, setTimezone] = useState("Europe/Paris");
  const [nightDate, setNightDate] = useState("");
  const [entryTime, setEntryTime] = useState("20:00");
  const [launchTime, setLaunchTime] = useState("21:00");
  const [closeTime, setCloseTime] = useState("02:00");
  const [threshold, setThreshold] = useState(4);

  const load = useCallback(async () => {
    const [venueResult, nightResult, countResult] = await Promise.all([
      supabase
        .from("venues")
        .select("id,slug,name,city,timezone,is_test_venue")
        .order("name"),
      supabase
        .from("venue_nights")
        .select("*")
        .order("waiting_opens_at", { ascending: false }),
      supabase.rpc("admin_venue_night_participant_counts"),
    ]);
    const firstError =
      venueResult.error ?? nightResult.error ?? countResult.error;
    if (firstError) {
      setError(`Could not load venues: ${firstError.message}`);
    } else {
      setVenues(venueResult.data ?? []);
      setNights(nightResult.data ?? []);
      setCounts(
        Object.fromEntries(
          (countResult.data ?? []).map((row) => [
            row.venue_night_id,
            row.participant_count,
          ])
        )
      );
      setError("");
      setLoadedAt(Date.now());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => { await load(); })();
    const channel = supabase
      .channel("admin-venue-workspace")
      .on("postgres_changes", { event: "*", schema: "public", table: "venue_nights" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "venues" }, () => void load())
      .subscribe((status) => { if (status === "SUBSCRIBED") void load(); });
    const timer = window.setInterval(() => void load(), 5_000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    const onFocus = () => void load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const nightsByVenue = useMemo(() => {
    const grouped = new Map<string, Night[]>();
    for (const night of nights) {
      grouped.set(night.venue_id, [...(grouped.get(night.venue_id) ?? []), night]);
    }
    return grouped;
  }, [nights]);

  function resetScheduleForm(night: Night | null, venue: Venue | null) {
    setEditingNight(night);
    setThreshold(night?.launch_threshold ?? 4);
    const waitingLocal = night
      ? isoToVenueLocalInput(night.waiting_opens_at, venue!.timezone)
      : "";
    const launchLocal = night
      ? isoToVenueLocalInput(night.guaranteed_launch_at, venue!.timezone)
      : "";
    const closeLocal = night
      ? isoToVenueLocalInput(night.closes_at, venue!.timezone)
      : "";
    setNightDate(waitingLocal.slice(0, 10));
    setEntryTime(waitingLocal.slice(11) || "20:00");
    setLaunchTime(launchLocal.slice(11) || "21:00");
    setCloseTime(closeLocal.slice(11) || "02:00");
  }

  function openEditor(venue: Venue | null) {
    const location = venue?.city === "New York" || venue?.timezone === "America/New_York"
      ? ROLLOUT_LOCATIONS[1]
      : ROLLOUT_LOCATIONS[0];
    setEditor({ venue });
    setModalOpen(true);
    setScheduleOpen(false);
    setDeletingNight(null);
    setDeleteOpen(false);
    setDeleteName("");
    setQrOpen(false);
    setQrDataUrl("");
    setLinkCopied(false);
    setError("");
    setName(venue?.name ?? "");
    setCity(location.city);
    setTimezone(location.timezone);
    resetScheduleForm(null, venue);
  }

  function addNight() {
    resetScheduleForm(null, editor?.venue ?? null);
    setScheduleOpen(true);
    setError("");
  }

  function editNight(night: Night) {
    resetScheduleForm(night, editor?.venue ?? null);
    setScheduleOpen(true);
    setError("");
  }

  async function toggleQr() {
    if (!editor?.venue) return;
    if (qrOpen) {
      setQrOpen(false);
      return;
    }
    if (!qrDataUrl) {
      setQrDataUrl(
        await QRCode.toDataURL(productionVenueUrl(editor.venue.slug), {
          width: 360,
          margin: 2,
          color: { dark: "#111827", light: "#FFFFFF" },
        })
      );
    }
    setQrOpen(true);
  }

  async function copyVenueLink() {
    if (!editor?.venue || !navigator.clipboard) return;
    await navigator.clipboard.writeText(productionVenueUrl(editor.venue.slug));
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 1800);
  }

  const zone = timezone;
  const waiting = nightDate && entryTime ? `${nightDate}T${entryTime}` : "";
  const guaranteed = nightDate && launchTime ? `${nightDate}T${launchTime}` : "";
  const hasValidLaunchOrder = launchFollowsEntry(nightDate, entryTime, launchTime);
  const closes =
    nightDate && closeTime ? after(guaranteed, nightDate, closeTime) : "";
  const resolved = [waiting, guaranteed, closes].map((value) =>
    resolveVenueLocalDateTime(value, zone)
  );
  const instants = hasValidLaunchOrder && resolved.every((item) => item.ok)
    ? resolved.map((item) => (item.ok ? item.iso : ""))
    : null;
  const locked = isNightLocked(editingNight);
  const overlappingNight = instants
    ? nights.find(
        (night) =>
          night.venue_id === editor?.venue?.id &&
          night.id !== editingNight?.id &&
          night.waiting_opens_at < instants[2] &&
          instants[0] < night.closes_at
      )
    : null;

  async function saveNight(event: FormEvent) {
    event.preventDefault();
    if (!editor?.venue || locked || overlappingNight) return;
    if (!hasValidLaunchOrder) {
      setError("Guaranteed launch must be later than entry on the same venue-local date.");
      return;
    }
    if (!instants) {
      const invalid = resolved.find((item) => !item.ok);
      setError(
        invalid && !invalid.ok
          ? invalid.message
          : "Complete the night date and all three times."
      );
      return;
    }
    setBusy(true);
    setError("");
    const schedule = {
      p_waiting_opens_at: instants[0],
      p_guaranteed_launch_at: instants[1],
      p_closes_at: instants[2],
      p_launch_threshold: threshold,
    };
    const { error: saveError } = editingNight
      ? await supabase.rpc("update_venue_night_schedule", {
          p_venue_night_id: editingNight.id,
          ...schedule,
        })
      : await supabase.rpc("schedule_venue_night", {
          p_venue_id: editor.venue.id,
          ...schedule,
        });
    if (saveError) setError(saveError.message);
    else {
      await load();
      setScheduleOpen(false);
      resetScheduleForm(null, editor.venue);
    }
    setBusy(false);
  }

  async function saveVenue() {
    if (!editor || !name.trim()) return;
    setBusy(true);
    setError("");
    const { data, error: saveError } = await supabase.rpc("save_venue_details", {
      p_venue_id: editor.venue?.id ?? null,
      p_name: name.trim(),
      p_slug: editor.venue?.slug ?? slugify(name),
      p_city: city,
      p_timezone: timezone,
    });
    if (saveError) {
      setError(saveError.message);
    } else if (data) {
      const savedVenue = data as Venue;
      setEditor({ venue: savedVenue });
      setName(savedVenue.name);
      setCity(savedVenue.city ?? city);
      setTimezone(savedVenue.timezone);
      await load();
    }
    setBusy(false);
  }

  async function nightAction(action: "launch" | "close" | "reopen") {
    if (!editingNight) return;
    setBusy(true);
    setError("");
    const rpc = `${action}_venue_night` as "launch_venue_night";
    const { error: actionError } = await supabase.rpc(rpc, {
      p_venue_night_id: editingNight.id,
    });
    if (actionError) setError(actionError.message);
    else {
      await load();
      setModalOpen(false);
      setEditor(null);
    }
    setBusy(false);
  }

  async function deleteScheduledNight() {
    if (!deletingNight || isNightLocked(deletingNight)) return;
    setBusy(true);
    setError("");
    const { error: deleteError } = await supabase.rpc("cancel_venue_night", {
      p_venue_night_id: deletingNight.id,
    });
    if (deleteError) {
      setError(deleteError.message);
    } else {
      if (editingNight?.id === deletingNight.id) {
        setScheduleOpen(false);
        resetScheduleForm(null, editor?.venue ?? null);
      }
      setDeletingNight(null);
      await load();
    }
    setBusy(false);
  }

  async function deleteVenue() {
    if (!editor?.venue || deleteName !== editor.venue.name) return;
    setBusy(true);
    setError("");
    const { error: deleteError } = await supabase.rpc(
      "delete_venue_configuration",
      { p_venue_id: editor.venue.id }
    );
    if (deleteError) setError(deleteError.message);
    else {
      setModalOpen(false);
      setEditor(null);
      await load();
    }
    setBusy(false);
  }

  const selectedVenueNights = editor?.venue
    ? (nightsByVenue.get(editor.venue.id) ?? [])
    : [];
  const liveNights = selectedVenueNights.filter((night) => !night.terminal_at && ["live", "waiting", "closed"].includes(night.status) && (night.opened_at || Date.parse(night.waiting_opens_at) <= loadedAt));
  const upcomingNights = selectedVenueNights.filter((night) => !night.terminal_at && !liveNights.some((item) => item.id === night.id));
  const historicalNights = selectedVenueNights.filter((night) => Boolean(night.terminal_at));

  return (
    <div>
      <header className="admin-page-header mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="night-kicker mb-2">Step 1 · Prepare the night</p>
          <h2 className="text-3xl font-black tracking-tight">Venues</h2>
          <p className="mt-2 text-sm text-white/55">
            Choose a venue to review or change its next opening.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openEditor(null)}
          className="night-button night-button-primary px-4 py-2 text-sm"
        >
          + Create venue
        </button>
      </header>

      {error && !editor && <p className="mb-4 text-sm text-blush">{error}</p>}
      {loading ? (
        <p className="night-muted">Loading…</p>
      ) : (
        <div className="admin-table-surface overflow-hidden rounded-2xl border">
          {venues.map((venue) => {
            const venueNights = nightsByVenue.get(venue.id) ?? [];
            const night =
              venueNights.find((item) => ["waiting", "live"].includes(item.status)) ??
              venueNights[0] ??
              null;
            const status = statusOf(night);
            return (
              <button
                key={venue.id}
                type="button"
                onClick={() => openEditor(venue)}
                className="grid w-full gap-3 border-b px-5 py-4 text-left transition last:border-0 md:grid-cols-[1.2fr_.65fr_1fr_.65fr_auto] md:items-center"
              >
                <div>
                  <p className="font-black">{venue.name}</p>
                  <p className="mt-1 text-xs text-white/40">
                    {venue.city ?? venue.timezone}
                    {venue.is_test_venue ? " · Test venue" : ""}
                  </p>
                </div>
                <span
                  className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold ${
                    status === "Live"
                      ? "bg-emerald-300/12 text-emerald-100"
                      : status === "Waiting"
                        ? "bg-amber-300/12 text-amber-100"
                        : "bg-white/8 text-white/55"
                  }`}
                >
                  {status}
                </span>
                <div>
                  <p className="text-xs text-white/40">Entry opens</p>
                  <p className="mt-1 text-sm font-bold">
                    {night
                      ? formatVenueInstant(night.waiting_opens_at, venue.timezone)
                      : "Not scheduled"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-white/40">
                    {venueNights.length === 1 ? "Launch threshold" : "Upcoming nights"}
                  </p>
                  <p className="mt-1 text-sm font-bold">
                    {venueNights.length > 1
                      ? venueNights.length
                      : night
                      ? `${counts[night.id] ?? 0} / ${night.launch_threshold}`
                      : "—"}
                  </p>
                </div>
                <span className="text-lg text-white/35">›</span>
              </button>
            );
          })}
        </div>
      )}

      {modalOpen && editor && typeof document !== "undefined" &&
        createPortal(
          <div
            className="admin-modal-overlay fixed inset-0 z-[100] grid place-items-center overflow-y-auto p-5"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setModalOpen(false);
                setEditor(null);
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              className="admin-modal-surface night-panel my-auto w-full max-w-2xl p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="night-kicker mb-2">
                    {editor.venue ? "Venue configuration" : "New venue"}
                  </p>
                  <h3 className="text-2xl font-black">
                    {editor.venue?.name ?? "Create venue"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setEditor(null);
                  }}
                  className="admin-close-button px-3 py-2 text-sm"
                >
                  Close
                </button>
              </div>

              {error && (
                <p className="mt-4 rounded-xl bg-blush/10 px-4 py-3 text-sm text-blush">
                  {error}
                </p>
              )}

              <form onSubmit={saveNight} className="mt-6 space-y-6">
                <section>
                  <p className="night-kicker mb-3">Venue</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-semibold">
                      Name
                      <input
                        required
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        className="night-input mt-1 px-4 py-3"
                      />
                    </label>
                    <label className="text-sm font-semibold">
                      Rollout location
                      <select
                        value={city}
                        disabled={Boolean(editor.venue?.is_test_venue)}
                        onChange={(event) => {
                          const location = ROLLOUT_LOCATIONS.find((item) => item.city === event.target.value)!;
                          setCity(location.city);
                          setTimezone(location.timezone);
                        }}
                        className="night-input mt-1 px-4 py-3 disabled:opacity-50"
                      >
                        {ROLLOUT_LOCATIONS.map((item) => (
                          <option key={item.city} value={item.city}>{item.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="night-muted text-xs">Venue details save independently from scheduled nights.</p>
                    {!editor.venue?.is_test_venue && (
                      <button type="button" disabled={busy || !name.trim()} onClick={() => void saveVenue()} className="night-button night-button-secondary px-4 py-2 text-sm disabled:opacity-50">
                        {busy ? "Saving…" : editor.venue ? "Save venue details" : "Create venue"}
                      </button>
                    )}
                  </div>
                </section>

                {editor.venue && (
                  <section>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="night-kicker mb-1">Production venue QR</p>
                        <p className="night-muted truncate text-sm">
                          {productionVenueUrl(editor.venue.slug)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void copyVenueLink()}
                          className="night-button night-button-secondary px-3 py-2 text-xs"
                        >
                          {linkCopied ? "Copied" : "Copy link"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleQr()}
                          className="night-button night-button-primary px-3 py-2 text-xs"
                        >
                          {qrOpen ? "Hide QR" : "View QR"}
                        </button>
                      </div>
                    </div>
                    {qrOpen && qrDataUrl && (
                      <div className="mt-4 grid gap-4 rounded-2xl border border-white/10 bg-white/50 p-4 sm:grid-cols-[160px_1fr] sm:items-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={qrDataUrl}
                          alt={`Permanent QR code for ${editor.venue.name}`}
                          width={160}
                          height={160}
                          className="rounded-xl border border-gray-200 bg-white p-2"
                        />
                        <div>
                          <p className="font-black">Production QR for every night</p>
                          <p className="night-muted mt-1 text-sm">
                            This always points to getamourette.com, including when viewed from a preview. The schedule opens the correct night.
                          </p>
                          <a
                            href={qrDataUrl}
                            download={`${editor.venue.slug}-qr.png`}
                            className="night-button night-button-secondary mt-4 inline-flex px-3 py-2 text-xs"
                          >
                            Download QR
                          </a>
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {editor.venue && (
                  <section>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="night-kicker mb-1">Nights</p>
                        <p className="text-sm text-white/55">
                          {selectedVenueNights.length === 0
                            ? "No nights scheduled yet."
                            : `${liveNights.length} live or active · ${upcomingNights.length} upcoming · ${historicalNights.length} historical`}
                        </p>
                        <p className="mt-1 text-xs text-white/40">
                          {ROLLOUT_LOCATIONS.find((item) => item.timezone === editor.venue!.timezone)?.label ?? editor.venue.timezone}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={addNight}
                        className="night-button night-button-primary px-4 py-2 text-sm"
                      >
                        + Add night
                      </button>
                    </div>
                    {selectedVenueNights.length > 0 && (
                      <div className="space-y-4">
                        {([
                          ["Live / active", liveNights],
                          ["Upcoming", upcomingNights],
                          ["History", historicalNights],
                        ] as const).map(([groupLabel, groupNights]) => groupNights.length > 0 && (
                          <div key={groupLabel}>
                            <p className="mb-2 text-xs font-black uppercase tracking-wider text-white/40">{groupLabel}</p>
                            <div className="overflow-hidden rounded-2xl border border-white/10">
                            {groupNights.map((night) => {
                          const lockedNight = isNightLocked(night);
                          return (
                            <div
                              key={night.id}
                              className="grid w-full gap-2 border-b border-white/10 px-4 py-3 text-left last:border-0 sm:grid-cols-[1fr_auto] sm:items-center"
                            >
                              <button
                                type="button"
                                onClick={() => editNight(night)}
                                className="min-w-0 text-left"
                              >
                                <strong className="block text-sm">
                                  {formatVenueInstant(
                                    night.waiting_opens_at,
                                    editor.venue!.timezone
                                  )}
                                </strong>
                                <span className="mt-1 block text-xs text-white/40">
                                  Launch {formatVenueInstant(night.guaranteed_launch_at, editor.venue!.timezone)} · Close {formatVenueInstant(night.closes_at, editor.venue!.timezone)}
                                </span>
                              </button>
                              <span className="flex items-center gap-3">
                                <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs font-bold text-white/55">
                                  {statusOf(night)}
                                </span>
                                <button type="button" onClick={() => editNight(night)} className="rounded-lg px-2 py-1 text-xs font-bold text-violet-200 transition hover:bg-white/10">
                                  {lockedNight ? "View" : "Edit"}
                                </button>
                                {!lockedNight && (
                                  <button
                                    type="button"
                                    onClick={() => setDeletingNight(night)}
                                    className="rounded-lg px-2 py-1 text-xs font-bold text-red-600 transition hover:bg-red-50"
                                    aria-label={`Delete scheduled night on ${formatVenueInstant(night.waiting_opens_at, editor.venue!.timezone)}`}
                                  >
                                    Delete
                                  </button>
                                )}
                              </span>
                            </div>
                          );
                            })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {selectedVenueNights.length === 0 && (
                      <p className="mt-4 rounded-xl border border-violet-300/15 bg-violet-300/8 px-4 py-3 text-sm text-violet-100">
                        Step 1 is complete. Add the first night when its entry, launch, and closing times are confirmed.
                      </p>
                    )}
                  </section>
                )}

                {scheduleOpen && (
                <section>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="night-kicker mb-1">
                        {editingNight ? "Edit scheduled night" : "New scheduled night"}
                      </p>
                      <p className="text-sm text-white/55">
                        Pick one date, then set the three times in order.
                      </p>
                    </div>
                    {editor.venue && (
                      <button
                        type="button"
                        onClick={() => {
                          setScheduleOpen(false);
                          resetScheduleForm(null, editor.venue);
                          setError("");
                        }}
                        className="admin-close-button px-3 py-2 text-xs"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  {locked && (
                    <p className="mb-3 rounded-xl bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                      Times are locked after entry opens. You can still control the
                      live room below.
                    </p>
                  )}
                  <label className="admin-date-control block p-4 text-sm font-semibold">
                    Night date
                    <input
                      required
                      disabled={locked}
                      type="date"
                      value={nightDate}
                      onChange={(event) => setNightDate(event.target.value)}
                      className="mt-2 block w-full bg-transparent text-xl font-black outline-none disabled:opacity-50"
                    />
                  </label>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    {[
                      ["Entry opens", entryTime, setEntryTime],
                      ["Guaranteed launch", launchTime, setLaunchTime],
                      ["Closes", closeTime, setCloseTime],
                    ].map(([label, value, setter], index) => (
                      <label
                        key={label as string}
                        className="admin-time-control p-4 text-sm font-semibold"
                      >
                        <span>{label as string}</span>
                        <input
                          required
                          disabled={locked}
                          type="time"
                          value={value as string}
                          onChange={(event) =>
                            (setter as (value: string) => void)(event.target.value)
                          }
                          className="mt-2 block w-full bg-transparent text-2xl font-black outline-none disabled:opacity-50"
                        />
                        {index === 2 &&
                          closes.slice(0, 10) !== nightDate && (
                            <span className="mt-2 block text-xs font-bold text-violet-200">
                              Next day
                            </span>
                          )}
                      </label>
                    ))}
                  </div>
                  <p className="night-muted mt-3 text-xs">
                    Times use {ROLLOUT_LOCATIONS.find((item) => item.timezone === zone)?.label ?? zone}. Overnight closing is detected automatically.
                  </p>
                  {!hasValidLaunchOrder && nightDate && (
                    <p className="mt-3 rounded-xl bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                      Guaranteed launch must be later than entry on the same date. Only closing may roll into the next day.
                    </p>
                  )}
                  {overlappingNight && (
                    <p className="mt-3 rounded-xl bg-amber-300/10 px-4 py-3 text-sm text-amber-700">
                      This overlaps another scheduled night for {editor.venue?.name}.
                    </p>
                  )}
                </section>
                )}

                {scheduleOpen && (
                <section>
                  <p className="night-kicker mb-3">Launch</p>
                  <label className="block max-w-xs text-sm font-semibold">
                    People needed to launch
                    <input
                      required
                      disabled={locked}
                      min="1"
                      type="number"
                      value={threshold}
                      onChange={(event) => setThreshold(Number(event.target.value))}
                      className="night-input mt-1 px-4 py-3 disabled:opacity-50"
                    />
                  </label>
                </section>
                )}

                <div className="admin-modal-actions flex flex-wrap justify-between gap-3 border-t pt-5">
                  <div className="flex flex-wrap gap-2">
                    {!editingNight?.terminal_at && editingNight?.status === "waiting" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void nightAction("launch")}
                        className="rounded-full bg-emerald-200 px-4 py-2 text-sm font-black text-emerald-950"
                      >
                        Launch now
                      </button>
                    )}
                    {!editingNight?.terminal_at && editingNight?.status === "live" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void nightAction("close")}
                        className="night-button night-button-secondary px-4 py-2 text-sm"
                      >
                        Pause room
                      </button>
                    )}
                    {!editingNight?.terminal_at && editingNight?.status === "closed" && editingNight.opened_at && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void nightAction("reopen")}
                        className="night-button night-button-secondary px-4 py-2 text-sm"
                      >
                        Reopen
                      </button>
                    )}
                    {editor.venue && !editor.venue.is_test_venue && (
                      <button
                        type="button"
                        onClick={() => setDeleteOpen(true)}
                        className="night-button night-button-danger px-4 py-2 text-xs"
                      >
                        Delete venue
                      </button>
                    )}
                  </div>
                  {scheduleOpen && (
                    <button
                      disabled={busy || locked || !hasValidLaunchOrder || Boolean(overlappingNight)}
                      className="night-button night-button-primary px-5 py-2 disabled:opacity-50"
                    >
                      {busy
                        ? "Saving…"
                          : editingNight
                            ? "Save changes"
                            : "Add scheduled night"
                          }
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {deleteOpen && editor?.venue && typeof document !== "undefined" &&
        createPortal(
          <div className="admin-modal-overlay fixed inset-0 z-[110] grid place-items-center p-5">
            <div className="admin-modal-surface night-panel w-full max-w-md p-6">
              <p className="night-kicker mb-2">Permanent action</p>
              <h3 className="text-xl font-black">Delete {editor.venue.name}?</h3>
              <p className="night-muted mt-3 text-sm">
                This permanently removes the venue and all its nights. If it is
                active, people are immediately checked out and ephemeral
                interactions are removed.
              </p>
              <label className="mt-5 block text-sm font-semibold">
                Type <strong>{editor.venue.name}</strong> to confirm
                <input
                  autoFocus
                  value={deleteName}
                  onChange={(event) => setDeleteName(event.target.value)}
                  className="night-input mt-2 px-4 py-3"
                />
              </label>
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  disabled={busy || deleteName !== editor.venue.name}
                  onClick={() => void deleteVenue()}
                  className="night-button night-button-danger px-4 py-2 disabled:opacity-40"
                >
                  Delete permanently
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeleteName("");
                  }}
                  className="night-button night-button-secondary px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {deletingNight && editor?.venue && typeof document !== "undefined" &&
        createPortal(
          <div className="admin-modal-overlay fixed inset-0 z-[110] grid place-items-center p-5">
            <div className="admin-modal-surface night-panel w-full max-w-md p-6">
              <p className="night-kicker mb-2">Scheduled night</p>
              <h3 className="text-xl font-black">Delete this night?</h3>
              <p className="night-muted mt-3 text-sm">
                {formatVenueInstant(
                  deletingNight.waiting_opens_at,
                  editor.venue.timezone
                )} at {editor.venue.name} will be removed from upcoming nights.
                The venue and its other scheduled nights will stay unchanged.
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void deleteScheduledNight()}
                  className="night-button night-button-danger px-4 py-2 disabled:opacity-50"
                >
                  {busy ? "Deleting…" : "Delete night"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDeletingNight(null)}
                  className="night-button night-button-secondary px-4 py-2"
                >
                  Keep night
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

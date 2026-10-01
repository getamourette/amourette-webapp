"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, ChevronRight, MapPin, Plus, QrCode, Settings2 } from "lucide-react";
import { BrandLogo } from "@/app/BrandLogo";
import { isValidText, VENUE_NAME_MAX_LENGTH } from "@/lib/input-validation";
import styles from "./workspace.module.css";

type Variant = "a" | "b";
type Scenario = "populated" | "empty" | "long" | "error";
type Night = { id: number; date: string; status: "Live" | "Paused" | "Scheduled" | "Ended" | "Cancelled"; entry: string; launch: string; close: string; people?: number };
type Panel = "details" | "qr" | "new" | "delete" | Night | null;
const FIXTURES: Night[] = [
  { id: 1, date: "2026-10-01", status: "Live", entry: "20:00", launch: "21:00", close: "02:00", people: 18 },
  { id: 2, date: "2026-10-02", status: "Scheduled", entry: "20:00", launch: "21:00", close: "02:00" },
  { id: 3, date: "2026-10-03", status: "Scheduled", entry: "19:30", launch: "20:30", close: "02:00" },
  { id: 4, date: "2026-09-26", status: "Ended", entry: "20:00", launch: "21:00", close: "02:00" },
  { id: 5, date: "2026-09-25", status: "Ended", entry: "20:00", launch: "21:00", close: "02:00" },
  { id: 6, date: "2026-09-24", status: "Cancelled", entry: "20:00", launch: "21:00", close: "02:00" },
];
const LOCATION = { Paris: "Europe/Paris", "New York": "America/New_York" } as const;
type City = keyof typeof LOCATION;
// Fixed English fixture labels avoid server/browser ICU abbreviation differences.
const dateLabel = (date: string) => {
  const value = new Date(`${date}T12:00:00Z`);
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][value.getUTCDay()]} ${value.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"][value.getUTCMonth()]}`;
};

function Button({ children, onClick, primary = false, type = "button" }: { children: ReactNode; onClick?: () => void; primary?: boolean; type?: "button" | "submit" }) {
  return <button type={type} onClick={onClick} className={`night-button ${primary ? "night-button-primary" : "night-button-secondary"} ${styles.button}`}>{children}</button>;
}

function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    return () => { element?.close(); if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  return <dialog ref={dialog} aria-labelledby="preview-dialog-title" className={`admin-modal-surface ${styles.dialog}`} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className={styles.dialogHeader}><h2 id="preview-dialog-title">{title}</h2><button type="button" aria-label="Close dialog" onClick={onClose} className={styles.close}>×</button></header>
    {children}
  </dialog>;
}

export default function WorkspacePreview() {
  const [variant, setVariant] = useState<Variant>("a");
  const [scenario, setScenario] = useState<Scenario>("populated");
  const [tab, setTab] = useState<"nights" | "details">("nights");
  const [atList, setAtList] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [venueName, setVenueName] = useState("Le Salon");
  const [city, setCity] = useState<City>("Paris");
  const [nights, setNights] = useState(FIXTURES);
  const [notice, setNotice] = useState("");
  const name = scenario === "long" ? "Le Salon des Rencontres Extraordinaires" : venueName;
  const visibleNights = scenario === "empty" ? [] : nights;
  const active = visibleNights.filter(night => night.status === "Live" || night.status === "Paused");
  const upcoming = visibleNights.filter(night => night.status === "Scheduled");
  const history = visibleNights.filter(night => night.status === "Ended" || night.status === "Cancelled");
  const selectedNight = typeof panel === "object" ? panel : null;
  const terminal = selectedNight?.status === "Ended" || selectedNight?.status === "Cancelled";
  const editable = panel === "new" || selectedNight?.status === "Scheduled";

  function switchVariant(next: Variant) { setVariant(next); setTab("nights"); setPanel(null); setNotice(""); }

  function venueDetails() {
    return <section className={styles.details} aria-label="Venue details">
      <div className={styles.sectionHeading}><h3>Venue details</h3><Settings2 size={17} aria-hidden="true" /></div>
      <p className={styles.muted}>Permanent details for every night.</p>
      <dl className={styles.metadata}>
        <div><dt>Name</dt><dd>{name}</dd></div>
        <div><dt>Location</dt><dd>{city}</dd></div>
        <div><dt>Time zone</dt><dd>{LOCATION[city]}</dd></div>
      </dl>
      <Button onClick={() => setPanel("details")}>Edit venue details</Button>
      <details className={styles.venueOptions}><summary>Venue options</summary><p>Remove this venue and its nights.</p><button type="button" className={styles.danger} onClick={() => setPanel("delete")}>Delete venue</button></details>
    </section>;
  }

  function nightRow(night: Night) {
    return <button key={night.id} type="button" className={styles.nightRow} onClick={() => { setNotice(""); setPanel(night); }} aria-label={`${night.status === "Scheduled" ? "Edit" : "View"} night ${dateLabel(night.date)}`}>
      <span className={styles.calendar}><strong>{night.date.slice(8)}</strong><span>{night.date.slice(5, 7) === "10" ? "OCT" : "SEP"}</span></span>
      <span className={styles.rowContent}><strong>{dateLabel(night.date)}</strong><span className={styles.timeline}>Entry {night.entry}<span aria-hidden="true"> · </span>Launch {night.launch}<span aria-hidden="true"> · </span>Close {night.close} <small>(+1 day)</small></span></span>
      <span className={styles.badge} data-status={night.status}>{night.status}</span><ChevronRight size={17} aria-hidden="true" className={styles.chevron} />
    </button>;
  }

  function nightWorkspace() {
    return <section className={styles.nights} aria-label="Nights">
      <div className={styles.sectionHeading}><div><h3>Nights</h3><p className={styles.muted}>All times in {city} · {LOCATION[city]}</p></div><Button primary onClick={() => { setNotice(""); setPanel("new"); }}><Plus size={16} aria-hidden="true" /> Add night</Button></div>
      {scenario === "error" ? <div className={styles.empty}><h4>Nights could not be loaded</h4><p>Your venue details are still available.</p><Button onClick={() => setScenario("populated")}>Try again</Button></div> : <>
        {active.map(night => <section key={night.id} className={styles.active} aria-label="Active night">
          <div className={styles.sectionHeading}><span className={styles.badge} data-status={night.status}><span className={styles.dot} />{night.status} now</span><span className={styles.muted}>{dateLabel(night.date)}</span></div>
          <div className={styles.activeBody}><div><strong>{night.people}</strong><span>people checked in</span></div><div><span>Closes at</span><strong className={styles.closeTime}>{night.close}<small> +1 day</small></strong></div><Button onClick={() => setPanel(night)}>Manage night <ArrowRight size={16} aria-hidden="true" /></Button></div>
        </section>)}
        <div className={styles.groupHeading}><h4>Upcoming</h4><span>{upcoming.length}</span></div>
        {upcoming.length ? <div className={styles.rows}>{upcoming.map(nightRow)}</div> : <div className={styles.empty}><CalendarDays size={26} aria-hidden="true" /><h4>{visibleNights.length ? "No upcoming nights" : "Ready for your first night"}</h4><p>Set an entry, launch and closing time.<br />The venue’s QR works for every night.</p><Button onClick={() => setPanel("new")}>Schedule a night</Button></div>}
        <details className={styles.history}><summary>History <span>{history.length}</span></summary><p className={styles.muted}>Ended and cancelled nights are read-only.</p>{history.length ? <div className={styles.rows}>{history.map(nightRow)}</div> : <p className={styles.muted}>Completed nights will appear here.</p>}</details>
      </>}
    </section>;
  }

  return <main className={`admin-shell night-shell flex-1 ${styles.preview}`}>
    <div className={styles.comparison} aria-label="Design comparison controls">
      <div><strong>#162 · Workspace comparison</strong><span>Simulated data · Local only</span></div>
      <div className={styles.variantSwitch}><button type="button" aria-pressed={variant === "a"} onClick={() => switchVariant("a")}>A · Venue page</button><button type="button" aria-pressed={variant === "b"} onClick={() => switchVariant("b")}>B · Tabs</button></div>
      <label>Scenario<select value={scenario} onChange={event => { const value = event.target.value; if (value === "populated" || value === "empty" || value === "long" || value === "error") { setScenario(value); setPanel(null); setNotice(""); } }}><option value="populated">Active + upcoming + history</option><option value="empty">No nights yet</option><option value="long">Long venue name</option><option value="error">Nights failed to load</option></select></label>
    </div>
    <div className="night-content mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
      {/* Reuse the real admin chrome classes and production logo; no auth simulation. */}
      <header className="admin-topbar mb-9 flex flex-wrap items-center gap-4 px-4 py-3 sm:px-5">
        <div className="mr-auto min-w-fit"><div className="brand-align-start mb-2 w-fit rounded-md bg-velvet"><BrandLogo /></div><h1 className="text-base font-bold tracking-tight">Control center</h1></div>
        <nav aria-label="Admin sections" className="admin-navigation order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">{[["Venues", "1 · Prepare"], ["Stats", "2 · Monitor"], ["Moderation", "3 · Intervene"], ["Feedback", "4 · Listen"]].map(([label, phase]) => <button key={label} type="button" aria-current={label === "Venues" ? "page" : undefined} className={`admin-nav-item inline-flex min-w-max flex-1 items-center justify-center gap-2 px-3 py-2 text-sm sm:flex-none ${label === "Venues" ? "is-active" : ""}`} onClick={() => label === "Venues" ? setAtList(true) : setNotice(`${label} is outside this workspace comparison.`)}><span className="text-left leading-tight"><span className="block">{label}</span><span className="admin-nav-phase block">{phase}</span></span></button>)}</nav>
      </header>
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      {atList ? <>
        <header className="admin-page-header mb-8"><p className="night-kicker mb-2">Step 1 · Prepare the night</p><h2>Venues</h2><p className={styles.muted}>Choose a venue to manage its nights.</p></header>
        <button type="button" className={styles.venueRow} onClick={() => setAtList(false)}><span><strong>{name}</strong><small>{city}</small></span><span>{active.length ? "Active tonight" : "No active night"}</span><span>{upcoming.length} upcoming nights</span><ChevronRight aria-hidden="true" size={20} /></button>
      </> : <>
        <button className={styles.back} type="button" onClick={() => setAtList(true)}><ArrowLeft size={16} aria-hidden="true" /> All venues</button>
        <header className={`admin-page-header ${styles.venueHeader}`}><div><p className="night-kicker mb-2">Venue workspace</p><h2>{name}</h2><p className={styles.location}><MapPin size={14} aria-hidden="true" />{city}<span>·</span>One venue, every night</p></div><Button onClick={() => setPanel("qr")}><QrCode size={17} aria-hidden="true" /> Production QR</Button></header>
        {variant === "a" ? <div className={styles.workspace}>{nightWorkspace()}<aside>{venueDetails()}</aside></div> : <>
          <div className={styles.tabs} aria-label="Venue sections">{(["nights", "details"] as const).map(value => <button type="button" key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{value === "nights" ? "Nights" : "Venue details"}{value === "nights" && <span>{active.length + upcoming.length}</span>}</button>)}</div>
          <div className={styles.tabContent}>{tab === "nights" ? nightWorkspace() : venueDetails()}</div>
        </>}
      </>}
    </div>
    {panel === "details" && <Dialog title="Edit venue details" onClose={() => setPanel(null)}><DetailsForm name={venueName} city={city} onSave={(nextName, nextCity) => { setVenueName(nextName); setCity(nextCity); setPanel(null); setNotice("Venue details saved in this preview. Night schedules are unchanged."); }} onCancel={() => setPanel(null)} /></Dialog>}
    {panel === "qr" && <Dialog title="Production venue QR" onClose={() => setPanel(null)}><div className={styles.dialogContent}><p className={styles.muted}>One permanent QR for {name}. The schedule opens the correct night.</p><div className={styles.qrPlaceholder}><QrCode size={120} strokeWidth={1} aria-hidden="true" /><strong>Sample QR placement</strong><span>Design preview · Not a scannable venue QR</span></div><p className={styles.url}>getamourette.com/v/le-salon</p><div className={styles.actions}><Button onClick={() => setNotice("Copy link is simulated; nothing was copied.")}>Copy link</Button><Button primary onClick={() => setNotice("QR download is simulated; no file was downloaded.")}>Download QR</Button></div><p role="status" className={styles.muted}>{notice}</p></div></Dialog>}
    {(panel === "new" || selectedNight) && <Dialog title={panel === "new" ? "Schedule a night" : terminal ? "Night details" : editable ? "Edit scheduled night" : "Manage night"} onClose={() => setPanel(null)}>
      <div className={styles.dialogContent}><p className={styles.muted}>{name} · {city} time</p>
        {selectedNight && <div className={styles.nightTitle}><h3>{dateLabel(selectedNight.date)}</h3><span className={styles.badge} data-status={selectedNight.status}>{selectedNight.status}</span></div>}
        {editable ? <form onSubmit={event => { event.preventDefault(); setNotice("Schedule form preview only. No night was saved."); }}>
          <label className={styles.field}>Night date<input type="date" required defaultValue={selectedNight?.date ?? "2026-10-04"} className="night-input" /></label>
          <div className={styles.timeFields}>{[["Entry opens", "entry"], ["Guaranteed launch", "launch"], ["Closes next day", "close"]].map(([label, key]) => <label key={key} className={styles.field}>{label}<input type="time" required defaultValue={selectedNight?.[key as "entry" | "launch" | "close"] ?? (key === "entry" ? "20:00" : key === "launch" ? "21:00" : "02:00")} className="night-input" /></label>)}</div>
          <label className={styles.field}>People needed to launch<input type="number" min={1} max={2147483647} step={1} required defaultValue={4} className="night-input" /></label>
          <p className={styles.muted}>Times use {LOCATION[city]}. The schedule locks once entry opens.</p>
          <div className={styles.actions}><Button onClick={() => setPanel(null)}>Cancel</Button><Button type="submit" primary>{panel === "new" ? "Add scheduled night" : "Save schedule"}</Button></div><p role="status" className={styles.muted}>{notice}</p>
          {selectedNight && <button type="button" className={styles.danger} onClick={() => setNotice("Night cancellation is simulated; no night was cancelled.")}>Cancel this scheduled night</button>}
        </form> : selectedNight && <>
          <dl className={styles.readonlyTimes}>{[["Entry opened", selectedNight.entry], ["Guaranteed launch", selectedNight.launch], ["Closing time", `${selectedNight.close} (+1 day)`], ["Launch threshold", "4 people"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <p className={styles.lockNotice}>{terminal ? "This night is part of venue history. Its schedule and status cannot be changed." : "The schedule is locked because entry has opened."}</p>
          {!terminal && <div className={styles.actions}><Button onClick={() => setPanel(null)}>Done</Button><Button primary onClick={() => { const next: Night = { ...selectedNight, status: selectedNight.status === "Live" ? "Paused" : "Live" }; setNights(current => current.map(night => night.id === next.id ? next : night)); setPanel(next); setNotice("Room state changed in this preview only."); }}>{selectedNight.status === "Live" ? "Pause room" : "Reopen room"}</Button></div>}
          <p role="status" className={styles.muted}>{notice}</p>
        </>}
      </div>
    </Dialog>}
    {panel === "delete" && <Dialog title={`Delete ${name}?`} onClose={() => setPanel(null)}><div className={styles.dialogContent}><p>This permanently removes the venue and its nights. Active attendees are checked out and ephemeral interactions are removed.</p><p className={styles.lockNotice}>Design preview: deletion is disabled.</p><div className={styles.actions}><Button onClick={() => setPanel(null)}>Keep venue</Button><button type="button" disabled className={styles.danger}>Delete permanently</button></div></div></Dialog>}
  </main>;
}

function DetailsForm({ name, city, onSave, onCancel }: { name: string; city: City; onSave: (name: string, city: City) => void; onCancel: () => void }) {
  const [draftName, setDraftName] = useState(name);
  const [draftCity, setDraftCity] = useState(city);
  const [error, setError] = useState("");
  return <form className={styles.dialogContent} onSubmit={event => { event.preventDefault(); if (!isValidText(draftName, VENUE_NAME_MAX_LENGTH)) { setError("Use 1–120 characters for the venue name."); return; } onSave(draftName.trim(), draftCity); }}>
    <p className={styles.muted}>These details apply to the venue. Night schedules save separately.</p>
    <label className={styles.field}>Venue name<input value={draftName} onChange={event => setDraftName(event.target.value)} required className="night-input" /></label>
    <label className={styles.field}>Rollout location<select value={draftCity} onChange={event => { if (event.target.value === "Paris" || event.target.value === "New York") setDraftCity(event.target.value); }} className="night-input"><option>Paris</option><option>New York</option></select></label>
    <p className={styles.muted}>{LOCATION[draftCity]}</p>
    {error && <p role="alert" className={styles.danger}>{error}</p>}
    <div className={styles.actions}><Button onClick={onCancel}>Cancel</Button><Button type="submit" primary>Save venue details</Button></div>
  </form>;
}

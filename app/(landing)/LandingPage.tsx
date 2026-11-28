"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { bookingRequest } from "@/lib/booking-client";
import { parseBookingEvent } from "@/lib/booking";
import { isRecord } from "@/lib/input-validation";
import { emailPreferenceStrings } from "@/lib/email-preference-strings";
import { legalHref, legalLabels } from "@/lib/legal";
import { privacyHref, privacyLabels } from "@/lib/privacy";
import { landingStrings, type Marked } from "@/lib/landing-strings";
import { landingAmount, landingBookingHref, landingDate, landingPlace, landingTime, type LandingNight } from "@/lib/landing-night";
import { INSTAGRAM_URL, type Locale } from "@/lib/strings";
import { setPreferredLocale } from "@/lib/useLocale";
import { WaitlistForm } from "@/app/WaitlistForm";
import { t } from "@/lib/strings";
import styles from "./landing.module.css";

type Next = { state: "loading" } | { state: "none" } | { state: "open"; night: LandingNight; href: string };

// Recompute hand-placed marks (the stamp, the felt arrow) when layout can move.
function useRelayout(callback: () => void) {
  useLayoutEffect(() => {
    callback();
    window.addEventListener("resize", callback);
    document.fonts?.ready.then(callback).catch(() => undefined);
    return () => window.removeEventListener("resize", callback);
  }, [callback]);
}

function InstagramIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5h.01" />
  </svg>;
}

function InstagramLink({ className, children, label }: { className: string; children: React.ReactNode; label?: string }) {
  return <a className={className} href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label={label}>{children}</a>;
}

// French first: the launch is in Paris.
const LANGUAGE_ORDER: readonly Locale[] = ["fr", "en", "es"];

const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");

export function LandingPage({ locale }: { locale: Locale }) {
  const s = landingStrings[locale];
  const newTab = legalLabels[locale].newTab;
  const [next, setNext] = useState<Next>({ state: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const result = await bookingRequest("next", undefined, undefined, controller.signal);
        const event = isRecord(result) ? result.event : undefined;
        if (event === null) { setNext({ state: "none" }); return; }
        const night = parseBookingEvent(event);
        setNext({ state: "open", night, href: landingBookingHref(night.night_id, window.location.search) });
      } catch {
        // No night we can trust: offer the waitlist rather than a dead button.
        if (!controller.signal.aborted) setNext({ state: "none" });
      }
    })();
    return () => controller.abort();
  }, []);

  const night = next.state === "open" ? next.night : null;
  const amount = landingAmount(night?.amount_minor ?? 1000, night?.currency ?? "eur", locale);

  return <div className={styles.root}>
    <div className={styles.page}>
      <header className={`${styles.head} ${styles.wrap}`}>
        <Image src="/brand/amourette-horizontal-cream.svg" alt="Amourette" width={1524} height={333} unoptimized priority className={styles.logo} />
        <InstagramLink className={styles.igHead} label={`${s.instagramLabel} (${newTab})`}><InstagramIcon /></InstagramLink>
      </header>

      <main>
        <section className={`${styles.hero} ${styles.wrap}`}>
          <h1>{s.headline}</h1>
        </section>

        <div className={`${styles.ticketZone} ${styles.wrap}`}>
          {next.state === "open"
            ? <Ticket locale={locale} night={next.night} href={next.href} amount={amount} />
            : <SoonTicket locale={locale} loading={next.state === "loading"} />}
          {next.state === "none" && <div className={styles.waitlist}><Waitlist locale={locale} /></div>}
        </div>

        <Steps locale={locale} />
        <Hand locale={locale} amount={amount} />
        <Faq locale={locale} amount={amount} />

        <section className={`${styles.igSec} ${styles.wrap}`}>
          <hr className={styles.hairline} />
          <p className={styles.igTitle}>{s.followTitle}</p>
          <InstagramLink className={styles.igBtn}><InstagramIcon /><span>{s.follow}</span><span className={styles.srOnly}> ({newTab})</span></InstagramLink>
        </section>
      </main>

      <Footer locale={locale} />
      {next.state === "open" && <div className={styles.barSpace} aria-hidden="true" />}
    </div>
    {next.state === "open" && <BookingBar locale={locale} night={next.night} href={next.href} />}
  </div>;
}

function Ticket({ locale, night, href, amount }: { locale: Locale; night: LandingNight; href: string; amount: string }) {
  const s = landingStrings[locale];
  const ticket = useRef<HTMLElement>(null), fields = useRef<HTMLDListElement>(null), refund = useRef<HTMLDivElement>(null);
  const stamp = useRef<HTMLSpanElement>(null);
  const [day, date] = landingDate(night.starts_at, night.timezone, locale);
  const place = landingPlace(night);

  // The stamp straddles the Caution / Remboursée border, centred just above
  // the fields so both values stay readable through it.
  const placeStamp = useCallback(() => {
    const box = ticket.current?.getBoundingClientRect(), row = fields.current?.getBoundingClientRect();
    const third = refund.current?.getBoundingClientRect();
    if (!box || !row || !third || !stamp.current) return;
    stamp.current.style.left = `${third.left - box.left + 16}px`;
    stamp.current.style.top = `${row.top - box.top - 14}px`;
    stamp.current.classList.add(styles.stampPlaced);
  }, []);
  useRelayout(placeStamp);

  return <article ref={ticket} className={styles.ticket} aria-label={fill(s.ticketLabel, { date: `${day} ${date}`, venue: night.venue_name, address: place })}>
    <span ref={stamp} className={styles.stamp} aria-hidden="true"><span>{s.stamp[0]}</span><span>{s.stamp[1]}</span></span>
    <div className={styles.tMain}>
      <div className={styles.tTop}>
        <Image src="/brand/amourette-emblem-ruby.svg" alt="" width={645} height={520} unoptimized className={styles.tEmb} />
        {night.city && <span className={styles.tCity}>{night.city}</span>}
      </div>
      <div>
        <p className={styles.tDate}><span>{day}</span><span>{date}</span></p>
        <p className={styles.tVenue}><span className={styles.tAt}>{s.atVenue}</span> {night.venue_name}</p>
        {place && <p className={styles.tAddr}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M8 14.5s4.8-4.4 4.8-8a4.8 4.8 0 0 0-9.6 0c0 3.6 4.8 8 4.8 8z" /><circle cx="8" cy="6.5" r="1.7" /></svg>
          {place}
        </p>}
      </div>
      <dl ref={fields} className={styles.tFields}>
        <div><dt>{s.hours}</dt><dd>{fill(s.hoursRange, { start: landingTime(night.starts_at, night.timezone, locale), end: landingTime(night.ends_at, night.timezone, locale) })}</dd></div>
        <div><dt>{s.deposit}</dt><dd>{amount}</dd></div>
        <div ref={refund}><dt>{s.refunded}</dt><dd>{s.onArrival}</dd></div>
      </dl>
    </div>
    <div className={styles.perf} aria-hidden="true"><span className={`${styles.notch} ${styles.notchL}`} /><span className={`${styles.notch} ${styles.notchR}`} /></div>
    <div className={styles.tStub} id="landing-book">
      <Link className={styles.btn} href={href}>{s.book}</Link>
      <p className={styles.fine}>{fill(s.fine, { amount })}</p>
    </div>
  </article>;
}

// No night open yet (or still loading): the same ticket, without a date to sell.
function SoonTicket({ locale, loading }: { locale: Locale; loading: boolean }) {
  const s = landingStrings[locale];
  return <article className={styles.ticket} aria-busy={loading} aria-label={loading ? s.loading : s.soonTitle}>
    <div className={styles.tMain}>
      <div className={styles.tTop}>
        <Image src="/brand/amourette-emblem-ruby.svg" alt="" width={645} height={520} unoptimized className={styles.tEmb} />
      </div>
      <div style={loading ? { visibility: "hidden" } : undefined}>
        <p className={styles.tDate}>{s.soonTitle}</p>
        <p className={styles.soonLead} style={{ marginTop: 12 }}>{s.soonLead}</p>
      </div>
    </div>
  </article>;
}

function Waitlist({ locale }: { locale: Locale }) {
  const l = t[locale].landing;
  return <WaitlistForm locale={locale} strings={{ label: l.waitlistLabel, placeholder: l.waitlistPlaceholder, help: l.waitlistHelp,
    cta: l.waitlistCta, successText: l.waitlistSuccess, alreadyText: l.waitlistAlready, invalidText: l.waitlistInvalid, errorText: l.waitlistError }} />;
}

function Steps({ locale }: { locale: Locale }) {
  const s = landingStrings[locale];
  return <section className={`${styles.steps} ${styles.wrap}`}>
    <h2>{s.stepsTitle}</h2>
    <ol className={styles.roll}>
      {s.steps.map((step, i) => <li key={step.title} className={styles.coupon}>
        <div className={styles.cStub} aria-hidden="true">
          <span className={styles.cNum}>{i + 1}</span>
          {i === 2 && <svg className={styles.cHeart} viewBox="0 0 24 24"><path fill="#CC1436" d="M12 21.2c-.4-.3-7.4-4.7-9.4-9.6C1.2 8.2 3.1 4.6 6.8 4.4c2-.1 3.6 1.2 5.3 3.3 1.6-2 3.2-3.4 5.3-3.3 3.8.3 5.5 3.9 4.1 7.3-2 4.8-9.1 9.2-9.5 9.5z" /><path fill="none" stroke="#A51330" strokeWidth=".9" d="M12 19.4c-1.6-1.1-6.2-4.2-7.7-8.2" /></svg>}
        </div>
        <div className={styles.cBody}><h3>{step.title}</h3><p>{step.text}</p></div>
      </li>)}
    </ol>
  </section>;
}

type Pen = "titleUnder" | "ring" | "box" | "under" | "redUnder";
const PEN: Record<Pen, { className: string; viewBox: string; paths: string[] }> = {
  titleUnder: { className: `${styles.black} ${styles.under}`, viewBox: "0 0 200 20", paths: ["M2 7c44-4 104-3 196-5", "M14 16c52-5 110-6 178-6"] },
  ring: { className: styles.red, viewBox: "0 0 200 60", paths: ["M40 9C92 1 170 3 192 20c12 12-6 30-62 35C72 60 14 56 6 36 1 22 30 9 84 6c40-2 80 0 104 9"] },
  box: { className: `${styles.black} ${styles.box}`, viewBox: "0 0 200 60", paths: ["M10 8C70 3 150 2 193 7c4 14 4 31 0 46C140 57 62 58 8 54C3 40 3 22 12 5"] },
  under: { className: `${styles.black} ${styles.under}`, viewBox: "0 0 200 20", paths: ["M3 9c60-5 130-6 194-3"] },
  redUnder: { className: `${styles.red} ${styles.under}`, viewBox: "0 0 200 20", paths: ["M2 8c50-6 120-6 196-2", "M8 15c56-4 118-5 186-3"] },
};
const MARK_WRAP: Partial<Record<Pen, string>> = { ring: styles.ring, box: styles.boxed };

function Mark({ text, pen, amount, markRef }: { text: Marked; pen: Pen; amount: string; markRef?: React.Ref<HTMLSpanElement> }) {
  const p = PEN[pen];
  return <>{fill(text.before, { amount })}<span ref={markRef} className={`${styles.mark} ${MARK_WRAP[pen] ?? ""}`}>{text.mark}
    <svg className={p.className} viewBox={p.viewBox} preserveAspectRatio="none" aria-hidden="true">{p.paths.map(d => <path key={d} d={d} />)}</svg>
  </span>{fill(text.after, { amount })}</>;
}

// Position of an element in the layout of an ancestor, ignoring CSS transforms.
function offsetIn(el: HTMLElement, root: HTMLElement) {
  let x = 0, y = 0, node: HTMLElement | null = el;
  while (node && node !== root) { x += node.offsetLeft; y += node.offsetTop; node = node.offsetParent as HTMLElement | null; }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

function Hand({ locale, amount }: { locale: Locale; amount: string }) {
  const s = landingStrings[locale];
  const sheet = useRef<HTMLElement>(null), target = useRef<HTMLSpanElement>(null), note = useRef<HTMLSpanElement>(null);
  const [arrow, setArrow] = useState<{ shaft: string; head: string } | null>(null);

  // The handwritten note's arrow points at the word underlined in red,
  // wherever the line breaks on this screen.
  const drawArrow = useCallback(() => {
    const root = sheet.current, word = target.current, hand = note.current;
    if (!root || !word || !hand) return;
    // Layout offsets inside the sheet, not screen rectangles: the sheet is
    // tilted, so its on-screen box is wider than the SVG's coordinate space.
    const a = offsetIn(word, root), b = offsetIn(hand, root);
    // The tip lands under the middle of the underlined word.
    const tx = a.x + a.w * 0.5, ty = a.y + a.h + 9;
    const sx = b.x - 8, sy = b.y + b.h * 0.55;
    const c1x = sx - 40, c1y = sy + 4, c2x = tx - 10, c2y = ty + 30;
    const angle = Math.atan2(ty - c2y, tx - c2x), length = 10, spread = 0.5;
    const end = (k: number) => `${tx - length * Math.cos(angle + k)} ${ty - length * Math.sin(angle + k)}`;
    setArrow({ shaft: `M${sx} ${sy}C${c1x} ${c1y} ${c2x} ${c2y} ${tx} ${ty}`, head: `M${end(-spread)}L${tx} ${ty}L${end(spread)}` });
  }, []);
  useRelayout(drawArrow);

  const [noMessages, noObligation, onSite, showUp] = s.hand;
  return <div className={styles.felt}>
    <section ref={sheet} className={styles.sheet}>
      <h2><Mark text={s.handTitle} pen="titleUnder" amount={amount} /></h2>
      <div className={styles.rule} />
      <dl className={styles.points}>
        <div className={styles.point}><dt><Mark text={noMessages.title} pen="ring" amount={amount} /></dt><dd>{noMessages.text}</dd></div>
        <div className={styles.point}><dt>{noObligation.title}</dt><dd><Mark text={noObligation.text} pen="box" amount={amount} /></dd></div>
        <div className={styles.point}><dt><Mark text={onSite.title} pen="under" amount={amount} /></dt><dd>{onSite.text}</dd></div>
        <div className={styles.point}><dt>{showUp.title}</dt><dd><Mark text={showUp.text} pen="redUnder" amount={amount} markRef={target} /></dd></div>
      </dl>
      <div className={styles.note} aria-hidden="true"><span ref={note}>{s.handNote}</span></div>
      {arrow && <svg className={styles.arrow} aria-hidden="true"><path d={arrow.shaft} /><path d={arrow.head} /></svg>}
    </section>
  </div>;
}

function Faq({ locale, amount }: { locale: Locale; amount: string }) {
  const s = landingStrings[locale];
  return <section className={`${styles.faq} ${styles.wrap}`}>
    <h2>{s.faqTitle}</h2>
    {s.faq.map(item => <details key={item.q} name="landing-faq">
      <summary><span><span className={styles.q}>{fill(item.q, { amount })}</span><span className={styles.short}>{item.short}</span></span><span className={styles.plus} aria-hidden="true" /></summary>
      <p className={styles.answer}>{item.a}</p>
    </details>)}
  </section>;
}

function Footer({ locale }: { locale: Locale }) {
  const s = landingStrings[locale];
  const labels = legalLabels[locale];
  return <footer className={`${styles.foot} ${styles.wrap}`}>
    <div className={styles.stub}>
      <div className={styles.stubEdge} aria-hidden="true"><span /><span /></div>
      <div className={styles.stubHead}>
        <Image src="/brand/amourette-emblem-ruby.svg" alt="" width={645} height={520} unoptimized className={styles.stubEmb} />
        <p>{s.footerLine}</p>
      </div>
      <nav className={styles.links} aria-label={labels.navigation}>
        <Link href={legalHref("legal", locale)} prefetch={false}>{labels.legal}</Link>
        <Link href={legalHref("terms", locale)} prefetch={false}>{labels.terms}</Link>
        <Link href={privacyHref(locale)} prefetch={false} aria-label={privacyLabels[locale].title}>{s.privacyLink}</Link>
        <Link href="/email-preferences" prefetch={false}>{emailPreferenceStrings[locale].footerLink}</Link>
      </nav>
      <div className={styles.stubRow}>
        <InstagramLink className={styles.stubIg}><InstagramIcon /><span>{s.handle}</span><span className={styles.srOnly}> ({labels.newTab})</span></InstagramLink>
        <div className={styles.langs} role="group" aria-label={s.languages}>
          {LANGUAGE_ORDER.map(code => <button key={code} type="button" lang={code} aria-pressed={code === locale} onClick={() => setPreferredLocale(code)}>{code.toUpperCase()}</button>)}
        </div>
      </div>
    </div>
  </footer>;
}

// Follows the visitor once the ticket's own button has scrolled out of view.
function BookingBar({ locale, night, href }: { locale: Locale; night: LandingNight; href: string }) {
  const s = landingStrings[locale];
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const stub = document.getElementById("landing-book");
    if (!stub || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => setShown(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    observer.observe(stub);
    return () => observer.disconnect();
  }, []);
  const [day, date] = landingDate(night.starts_at, night.timezone, locale);
  return <div className={`${styles.bar} ${shown ? styles.barOn : ""}`} aria-hidden={!shown}>
    <div className={styles.barIn}>
      <div className={styles.barTxt}><b>{day} {date}</b>{[night.venue_name, night.city].filter(Boolean).join(", ")}</div>
      <Link className={styles.btn} href={href} tabIndex={shown ? 0 : -1}>{s.book}</Link>
    </div>
  </div>;
}

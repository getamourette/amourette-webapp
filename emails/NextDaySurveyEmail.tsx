import { launchMailLogo } from "@/lib/launch-mail-logo";
import { render } from "@react-email/render";
import { surveyStrings } from "@/lib/survey-strings";
import type { LaunchMailContext } from "@/lib/launch-mail";

// #559: thank-you email the day after a night, to guests who arrived. A link to
// the survey and nothing promotional; the next-night opt-in lives on the page.
export function NextDaySurveyEmail({ context: c, url }: { context: LaunchMailContext; url: string }) {
  const s = surveyStrings[c.locale];
  const day = new Intl.DateTimeFormat(c.locale, { weekday: "long", day: "numeric", month: "long", timeZone: c.timezone }).format(new Date(c.starts_at));
  const subject = s.subject.replace("{day}", () => day);
  const muted = { color: "#bca9a3", lineHeight: 1.6 };
  return { subject, element: <html lang={c.locale}><body style={{ background: "#120A0F", color: "#EFE6E0", fontFamily: "Arial, sans-serif", margin: 0 }}>
    <main style={{ maxWidth: 560, padding: "40px 24px", margin: "auto", overflowWrap: "anywhere", background: "#120A0F" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`cid:${launchMailLogo.cid}`} alt="Amourette" width={launchMailLogo.width} height={launchMailLogo.height} style={{ display: "block", margin: "0 0 28px", background: "#120A0F", color: "#EFE6E0", fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 28 }} />
      <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 28, lineHeight: 1.25 }}>{subject}.</h1>
      <p style={{ lineHeight: 1.6 }}><strong>{c.venue_name}</strong>{c.city ? `, ${c.city}` : ""}</p>
      <p style={{ lineHeight: 1.6 }}>{s.lead}</p>
      <p style={{ margin: "28px 0" }}><a href={url} style={{ display: "inline-block", background: "#c94655", color: "#FFFFFF", fontSize: 17, fontWeight: 700, textDecoration: "none", padding: "14px 22px", borderRadius: 8 }}>{s.action}</a></p>
      <p style={muted}>{s.private} {s.open}</p>
      <p style={{ ...muted, fontSize: 14, marginTop: 32, paddingTop: 20, borderTop: "1px solid #3a2a31" }}>
        {s.once}<br />{s.help} <a href="mailto:hello@getamourette.com" style={{ color: "#EFE6E0" }}>hello@getamourette.com</a>
      </p>
      <p style={{ color: "#bca9a3", fontSize: 12, lineHeight: 1.7 }}>{s.signature}</p>
    </main></body></html> };
}

export async function renderNextDaySurveyEmail(context: LaunchMailContext, url: string) {
  const { subject, element } = NextDaySurveyEmail({ context, url });
  return { subject, html: await render(element), text: await render(element, { plainText: true }) };
}

import { render } from "@react-email/render";
import type { Locale } from "@/lib/strings";
import { campaignSchedule, type CampaignNight } from "@/lib/email-campaigns";

const copy = {
  en: { subject: "Your next Amourette night", heading: "See you at the bar.", intro: "A new place. A familiar spark. Here are your next Amourette nights.", note: "Come to the bar and scan the QR code when you arrive. The people you meet are right there with you.", preferences: "Unsubscribe or manage email preferences" },
  fr: { subject: "Votre prochaine soirée Amourette", heading: "On se retrouve au bar.", intro: "Un nouveau lieu. La même étincelle. Voici les prochaines soirées Amourette.", note: "Rendez-vous au bar et scannez le QR code en arrivant. Les personnes que vous rencontrez sont là, avec vous.", preferences: "Se désinscrire ou gérer mes préférences email" },
  es: { subject: "Tu próxima noche Amourette", heading: "Nos vemos en el bar.", intro: "Un nuevo lugar. La misma chispa. Estas son tus próximas noches Amourette.", note: "Ven al bar y escanea el código QR al llegar. Las personas que conoces están ahí, contigo.", preferences: "Darme de baja o gestionar mis preferencias de email" },
} satisfies Record<Locale, Record<string, string>>;

type Props = { locale: Locale; nights: CampaignNight[]; preferencesUrl: string };

export function UpcomingNightsEmail({ locale, nights, preferencesUrl }: Props) {
  const text = copy[locale];
  return <html lang={locale}><body style={{ margin: 0, background: "#1a0f12", color: "#f5ead8", fontFamily: "Georgia, serif" }}>
    <div style={{ display: "none", maxHeight: 0, overflow: "hidden" }}>{text.intro}</div>
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "48px 24px" }}>
      <p style={{ color: "#c94655", fontSize: 30, fontStyle: "italic", margin: "0 0 36px" }}>Amourette</p>
      <h1 style={{ fontSize: 32, fontWeight: 400 }}>{text.heading}</h1>
      <p style={{ fontFamily: "Arial, sans-serif", lineHeight: 1.65 }}>{text.intro}</p>
      {nights.map(night => <section key={night.id} style={{ borderTop: "1px solid #6e4148", padding: "20px 0" }}>
        <h2 style={{ fontSize: 24, fontWeight: 400, margin: "0 0 8px", overflowWrap: "anywhere" }}>{night.name}</h2>
        {night.city && <p style={{ margin: "0 0 8px", fontFamily: "Arial, sans-serif" }}>{night.city}</p>}
        <p style={{ color: "#bca9a3", fontSize: 14, lineHeight: 1.6, fontFamily: "Arial, sans-serif" }}>{campaignSchedule(night, locale)}</p>
      </section>)}
      <p style={{ fontFamily: "Arial, sans-serif", fontSize: 14, lineHeight: 1.65 }}>{text.note}</p>
      <p style={{ borderTop: "1px solid #6e4148", marginTop: 32, paddingTop: 24 }}>
        <a href={preferencesUrl} style={{ color: "#f5ead8", fontFamily: "Arial, sans-serif", fontSize: 13 }}>{text.preferences}</a>
      </p>
    </main>
  </body></html>;
}

export async function renderUpcomingNightsEmail(props: Props) {
  const component = <UpcomingNightsEmail {...props} />;
  return { subject: copy[props.locale].subject, html: await render(component), text: await render(component, { plainText: true }) };
}

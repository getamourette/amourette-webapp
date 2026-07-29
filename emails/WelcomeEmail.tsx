import type { Locale } from "@/lib/strings";

type WelcomeEmailProps = {
  locale: Locale;
  preferencesUrl: string;
};

const copy = {
  en: {
    subject: "Welcome to Amourette",
    preview: "You’ll hear from us when the next Amourette nights are announced.",
    heading: "You’re on the list.",
    body: "We’ll only write when there’s another Amourette night worth stepping out for.",
    note: "Amourette happens in the bar, in the moment. Email only gets you back to the door.",
    preferences: "Manage email preferences",
  },
  fr: {
    subject: "Bienvenue chez Amourette",
    preview: "Nous vous préviendrons lorsque les prochaines soirées Amourette seront annoncées.",
    heading: "Vous êtes sur la liste.",
    body: "Nous vous écrirons uniquement lorsqu’une nouvelle soirée Amourette mérite de sortir.",
    note: "Amourette se vit au bar, dans l’instant. L’email vous ramène simplement jusqu’à la porte.",
    preferences: "Gérer mes préférences email",
  },
  es: {
    subject: "Te damos la bienvenida a Amourette",
    preview: "Te avisaremos cuando se anuncien las próximas noches Amourette.",
    heading: "Ya estás en la lista.",
    body: "Solo te escribiremos cuando haya otra noche Amourette por la que merezca la pena salir.",
    note: "Amourette ocurre en el bar, en el momento. El email solo te lleva de vuelta a la puerta.",
    preferences: "Gestionar preferencias de email",
  },
} satisfies Record<Locale, Record<string, string>>;

export function WelcomeEmail({ locale, preferencesUrl }: WelcomeEmailProps) {
  const text = copy[locale];
  return (
    <html lang={locale}>
      <body style={{ margin: 0, background: "#1a0f12", color: "#f5ead8", fontFamily: "Georgia, serif" }}>
        <div style={{ display: "none", maxHeight: 0, overflow: "hidden" }}>{text.preview}</div>
        <main style={{ maxWidth: 560, margin: "0 auto", padding: "56px 28px" }}>
          <p style={{ color: "#c94655", fontSize: 30, fontStyle: "italic", margin: "0 0 44px" }}>Amourette</p>
          <h1 style={{ fontSize: 34, fontWeight: 400, lineHeight: 1.15, margin: "0 0 22px" }}>{text.heading}</h1>
          <p style={{ color: "#f5ead8", fontFamily: "Arial, sans-serif", fontSize: 17, lineHeight: 1.65 }}>{text.body}</p>
          <p style={{ color: "#bca9a3", fontFamily: "Arial, sans-serif", fontSize: 14, lineHeight: 1.6, marginTop: 28 }}>{text.note}</p>
          <p style={{ borderTop: "1px solid #6e4148", marginTop: 42, paddingTop: 24 }}>
            <a href={preferencesUrl} style={{ color: "#f5ead8", fontFamily: "Arial, sans-serif", fontSize: 13 }}>{text.preferences}</a>
          </p>
        </main>
      </body>
    </html>
  );
}

export function renderWelcomeEmail(props: WelcomeEmailProps) {
  const text = copy[props.locale];
  return {
    subject: text.subject,
    html: `<!doctype html><html lang="${props.locale}"><body style="margin:0;background:#1a0f12;color:#f5ead8;font-family:Georgia,serif"><div style="display:none;max-height:0;overflow:hidden">${text.preview}</div><main style="max-width:560px;margin:0 auto;padding:56px 28px"><p style="color:#c94655;font-size:30px;font-style:italic;margin:0 0 44px">Amourette</p><h1 style="font-size:34px;font-weight:400;line-height:1.15;margin:0 0 22px">${text.heading}</h1><p style="color:#f5ead8;font-family:Arial,sans-serif;font-size:17px;line-height:1.65">${text.body}</p><p style="color:#bca9a3;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;margin-top:28px">${text.note}</p><p style="border-top:1px solid #6e4148;margin-top:42px;padding-top:24px"><a href="${props.preferencesUrl}" style="color:#f5ead8;font-family:Arial,sans-serif;font-size:13px">${text.preferences}</a></p></main></body></html>`,
    text: ["Amourette", "", text.heading, "", text.body, "", text.note, "", `${text.preferences}: ${props.preferencesUrl}`].join("\n"),
  };
}

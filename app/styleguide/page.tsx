// Living design-system reference for Amourette (the system v2, docs/design.md).
// Dogfoods the wired tokens, fonts and shadcn mapping so the system can be seen
// rendered, by a founder or an agent picking up the #38 refonte. Kept in sync as
// the system evolves. Reachable at /styleguide.
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Amourette · styleguide",
  description: "The Amourette design system, rendered.",
};

const PALETTE: { name: string; token: string; note: string }[] = [
  { name: "velvet", token: "#120A0F", note: "app ground" },
  { name: "bordeaux", token: "#1D0F15", note: "surfaces / cards" },
  { name: "red", token: "#CC1436", note: "the ♥ · CTA · live-dot" },
  { name: "red-deep", token: "#A51330", note: "full-red reveal base" },
  { name: "wine", token: "#7C0F24", note: "depth / gradients" },
  { name: "champagne", token: "#D9B779", note: "hairline only" },
  { name: "blush", token: "#E9B9BC", note: "soft / safety / focus" },
  { name: "cream", token: "#EFE6E0", note: "primary text" },
  { name: "taupe", token: "#9D8A86", note: "secondary text" },
  { name: "ink", token: "#1A0F12", note: "text on light" },
];

const RADII: { name: string; px: number }[] = [
  { name: "sm", px: 12 },
  { name: "md", px: 16 },
  { name: "lg", px: 20 },
  { name: "xl", px: 28 },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="night-content px-6 py-8">
      <p className="night-kicker mb-5">{title}</p>
      {children}
    </section>
  );
}

const figtree = { fontFamily: "var(--font-figtree)" } as const;
const jost = { fontFamily: "var(--font-jost)" } as const;
const fraunces = { fontFamily: "var(--font-fraunces)", fontStyle: "italic", fontWeight: 500 } as const;

export default function Styleguide() {
  return (
    <main className="night-shell mx-auto max-w-md pb-16">
      <div className="night-content px-6 pt-10 pb-4">
        <p className="night-kicker mb-3">Amourette · design system</p>
        <h1 className="wordmark text-cream" style={{ fontSize: 42, lineHeight: 1 }}>
          the system, v2
        </h1>
        <p className="mt-3 text-taupe" style={{ ...figtree, fontSize: 14, lineHeight: 1.55 }}>
          Living reference. The tokens, fonts and shadcn mapping, rendered. See
          <span className="text-cream"> docs/design.md</span> for the spec and the
          component rules.
        </p>
      </div>

      <hr className="hairline mx-6" />

      <Section title="Palette · v2 · all WCAG-pass">
        <div className="grid grid-cols-2 gap-3">
          {PALETTE.map((c) => (
            <div key={c.name} className="night-card overflow-hidden" style={{ borderRadius: 16 }}>
              <div style={{ background: c.token, height: 52 }} />
              <div className="px-3 py-2">
                <p style={{ ...jost, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cream)" }}>
                  {c.name}
                </p>
                <p className="text-taupe" style={{ ...figtree, fontSize: 11 }}>
                  {c.token} · {c.note}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <hr className="hairline mx-6" />

      <Section title="Type · Fraunces / Figtree / Jost">
        <p style={{ ...fraunces, fontSize: 48, lineHeight: 1, color: "var(--cream)" }}>Camille</p>
        <p className="mt-1 text-taupe" style={{ ...jost, fontSize: 11, letterSpacing: "0.1em" }}>
          display-hero · Fraunces italic 500 · 48
        </p>

        <p className="mt-6" style={{ ...fraunces, fontSize: 30, lineHeight: 1.1, color: "var(--cream)" }}>
          You both tapped
        </p>
        <p className="mt-1 text-taupe" style={{ ...jost, fontSize: 11, letterSpacing: "0.1em" }}>
          title / reveal · Fraunces italic 500 · 30
        </p>

        <p className="mt-6 text-cream" style={{ ...figtree, fontWeight: 300, fontSize: 14.5, lineHeight: 1.55 }}>
          Architecte le jour, DJ le week-end. Je cherche quelqu&apos;un qui rit fort et
          commande le dernier verre. Body copy in Figtree 300, readable in dim light.
        </p>
        <p className="mt-1 text-taupe" style={{ ...jost, fontSize: 11, letterSpacing: "0.1em" }}>
          body · Figtree 300 · 14.5
        </p>

        <p className="mt-6 night-kicker">in the room · 24 here</p>
        <p className="mt-2 text-taupe" style={{ ...jost, fontSize: 11, letterSpacing: "0.1em" }}>
          kicker · Jost 400 upper · tracking .3em
        </p>
      </Section>

      <hr className="hairline mx-6" />

      <Section title="Radius · sm 12 · md 16 · lg 20 · xl 28">
        <div className="flex items-end gap-3">
          {RADII.map((r) => (
            <div key={r.name} className="flex flex-col items-center gap-2">
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: r.px,
                  background: "var(--bordeaux)",
                  border: "1px solid rgba(217,183,121,0.22)",
                }}
              />
              <span className="text-taupe" style={{ ...jost, fontSize: 10, letterSpacing: "0.1em" }}>
                {r.name} · {r.px}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <hr className="hairline mx-6" />

      <Section title="Buttons · our classes">
        <div className="flex flex-col gap-3">
          <button className="night-button night-button-primary px-6 py-3 text-sm">Start the chat</button>
          <button className="night-button night-button-secondary px-6 py-3 text-sm">See who else is here</button>
          <button className="night-button night-button-danger px-6 py-3 text-sm">Report · block</button>
        </div>
      </Section>

      <Section title="Buttons · shadcn &lt;Button&gt; (token mapping)">
        <div className="flex flex-wrap gap-3">
          <Button>default → red</Button>
          <Button variant="secondary">secondary</Button>
          <Button variant="outline">outline</Button>
          <Button variant="ghost">ghost</Button>
          <Button variant="destructive">destructive → blush</Button>
        </div>
      </Section>

      <hr className="hairline mx-6" />

      <Section title="Surfaces · elevation">
        <div className="flex flex-col gap-4">
          <div className="night-card p-5">
            <p className="text-cream" style={{ ...figtree, fontSize: 14 }}>night-card · bordeaux, champagne hairline .14</p>
          </div>
          <div className="night-panel p-5">
            <p className="text-cream" style={{ ...figtree, fontSize: 14 }}>night-panel · gradient lift + deeper shadow</p>
          </div>
          <div className="night-card-hot p-5">
            <p className="text-cream" style={{ ...figtree, fontSize: 14 }}>night-card-hot · warm wash, still no red</p>
          </div>
        </div>
      </Section>

      <hr className="hairline mx-6" />

      <Section title="The ♥ · idle vs liked">
        <div className="flex gap-3">
          <button className="heart-button heart-idle px-5 py-3 text-sm">♥ Tap</button>
          <button className="heart-button heart-liked px-5 py-3 text-sm">♥ Liked</button>
        </div>
        <p className="mt-3 text-taupe" style={{ ...figtree, fontSize: 12, lineHeight: 1.55 }}>
          v2 flips this to &quot;red present&quot; (filled ♥ at rest) on the room card;
          lands with the hero rebuild. These classes still show the 07-03 idle rule.
        </p>
      </Section>

      <hr className="hairline mx-6" />

      <Section title="Scrim · photo → velvet (never black)">
        <div className="relative overflow-hidden" style={{ height: 200, borderRadius: 20, background: "linear-gradient(135deg,#5b2a38,#2a1520)" }}>
          <div className="card-scrim absolute inset-0" />
          <div className="absolute inset-x-0 bottom-0 p-4">
            <p className="night-kicker" style={{ color: "var(--red)" }}>● in the room</p>
            <p style={{ ...fraunces, fontSize: 34, color: "var(--cream)", lineHeight: 1 }}>Inès</p>
          </div>
        </div>
        <p className="mt-3 text-taupe" style={{ ...figtree, fontSize: 12, lineHeight: 1.55 }}>
          Placeholder gradient stands in for a real photo. Motion (docs/design.md):
          300–500ms fades, Expo.out entrances, press scale 0.97, the ♥ blooms once.
        </p>
      </Section>
    </main>
  );
}

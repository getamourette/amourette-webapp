import type { Metadata, Viewport } from "next";
import { Fraunces, Figtree, Jost } from "next/font/google";
import "./globals.css";

// viewport-fit=cover exposes env(safe-area-inset-*) so full-bleed surfaces (the
// chat, the room) can pad around the notch and the iOS home indicator instead
// of the browser reserving that space and leaving letterbox bars.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#190b10",
};

// Amourette type system (docs/design.md — the system v2): Fraunces for
// display/wordmark/reveal (italic is the brand voice), Figtree for body,
// Jost for uppercase tracked labels and buttons. All three are variable
// fonts, so weights are covered without listing them.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  display: "swap",
});

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Amourette",
  description: "See who's in the bar tonight. Like discreetly, match if it's mutual.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${figtree.variable} ${jost.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

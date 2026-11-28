import { PhotoSync } from "@/components/PhotoSync";
import { SessionNotice } from "@/components/SessionNotice";
import type { Metadata, Viewport } from "next";
import { siteMetadata } from "@/lib/site-metadata";
import { appFontVariables } from "./fonts";
import "./globals.css";

// viewport-fit=cover exposes env(safe-area-inset-*) so full-bleed surfaces (the
// chat, the room) can pad around the notch and the iOS home indicator instead
// of the browser reserving that space and leaving letterbox bars.
export const viewport: Viewport = {
  viewportFit: "cover",
};

// Fonts: app/fonts.ts (self-hosted hinted files, #607).

// Generic title, description and link preview for every page (#277); whether a
// page may be indexed is decided by the X-Robots-Tag header in next.config.ts.
export const metadata: Metadata = siteMetadata;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${appFontVariables} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><PhotoSync />{children}<SessionNotice /></body>
    </html>
  );
}

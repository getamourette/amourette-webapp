import type { Metadata } from "next";
import { SITE_URL } from "@/lib/search-indexing";
import { t } from "@/lib/strings";

// Search and link-preview text (#277), reused from the landing page copy so a
// shared link says what the page says. Nothing here names a venue or a night: a
// shared venue or reservation link shows this generic preview.
const landing = t.en.landing;
export const SITE_TITLE = `Amourette · ${landing.kicker.replace(/\.$/, "")}`;
export const SITE_DESCRIPTION = landing.promise;

// No page below the root sets openGraph: Next would replace this whole object,
// image included (app/opengraph-image.tsx is attached at the root segment).
export const siteMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Amourette",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_US",
    alternateLocale: ["fr_FR", "es_ES"],
  },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
};

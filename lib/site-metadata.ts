import type { Metadata } from "next";
import { SITE_URL } from "@/lib/search-indexing";

// Shared links use the French launch copy, including venue and reservation links.
const title = "Amourette";
const description = "Des soirées dans des bars, à Paris. Tu likes quelqu'un sur place. Si ce n'est pas réciproque, personne ne le saura.";

// No page below the root sets openGraph: Next would replace this whole object,
// image included (app/opengraph-image.tsx is attached at the root segment).
export const siteMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title,
  description,
  openGraph: {
    type: "website",
    siteName: "Amourette",
    title,
    description,
    locale: "fr_FR",
  },
  twitter: { card: "summary_large_image", title, description },
};

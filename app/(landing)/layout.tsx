import type { Metadata } from "next";
import { SITE_URL } from "@/lib/search-indexing";
import { sharedOpenGraph } from "@/lib/site-metadata";

// The landing page is the only indexable page (#277), so it alone names the
// canonical URL. Its client page cannot export metadata, hence this layout.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { ...sharedOpenGraph, url: SITE_URL },
};

export default function LandingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}

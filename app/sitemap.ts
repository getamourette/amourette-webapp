import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/lib/search-indexing";

// Only genuinely public, indexable pages (#277): the production landing page.
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries(process.env);
}

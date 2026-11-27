import type { MetadataRoute } from "next";
import { robotsRules } from "@/lib/search-indexing";

// Generated at build time: VERCEL_ENV decides production versus preview (#277).
export default function robots(): MetadataRoute.Robots {
  return robotsRules(process.env);
}

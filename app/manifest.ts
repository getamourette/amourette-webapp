import type { MetadataRoute } from "next";

// Temporary install surface for the #119 physical-device continuity POC.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Amourette Session Lab",
    short_name: "Session Lab",
    description: "Temporary Safari-to-PWA session continuity laboratory.",
    start_url: "/session-continuity-lab",
    display: "standalone",
    background_color: "#190b10",
    theme_color: "#190b10",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}

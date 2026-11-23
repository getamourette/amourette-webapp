// Global response headers (SEC-014, #377). Evaluated by next.config.ts at build
// time, so the allowed origins follow the environment each deployment is built for.

type HeaderEnv = {
  NODE_ENV?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  CSP_REPORT_URI?: string;
};

function httpUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

// Report-only: observed, never blocking. Enforcing it is a separate decision that
// needs a nonce (dynamic rendering) or hashes to drop 'unsafe-inline' for scripts.
export function reportOnlyContentSecurityPolicy(env: HeaderEnv): string {
  const supabase = httpUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  // REST, Auth and Storage use the project origin; Realtime uses its WebSocket twin.
  const backend = supabase
    ? [supabase.origin, `${supabase.protocol === "https:" ? "wss" : "ws"}://${supabase.host}`]
    : [];
  const report = httpUrl(env.CSP_REPORT_URI);
  const directives = [
    ["default-src", "'self'"],
    // Next.js inlines its bootstrap scripts; development also needs eval for React.
    ["script-src", "'self'", "'unsafe-inline'", ...(env.NODE_ENV === "development" ? ["'unsafe-eval'"] : [])],
    // React `style` props and next/font emit inline styles.
    ["style-src", "'self'", "'unsafe-inline'"],
    // blob: authorized photo downloads and crop previews; data: generated QR codes
    // and CSS textures; the project origin covers legacy public photo URLs.
    ["img-src", "'self'", "data:", "blob:", ...(supabase ? [supabase.origin] : [])],
    // next/font self-hosts the Google fonts at build time.
    ["font-src", "'self'"],
    // blob: the cropper reads its own preview back with fetch().
    ["connect-src", "'self'", "blob:", ...backend],
    ["media-src", "'self'", "blob:"],
    ["worker-src", "'self'", "blob:"],
    ["object-src", "'none'"],
    ["frame-src", "'none'"],
    ["frame-ancestors", "'none'"],
    ["base-uri", "'self'"],
    // Stripe Checkout is reached by a top-level navigation, not a form post.
    ["form-action", "'self'"],
    // A URL containing a directive or policy separator would corrupt the header.
    ...(report && !/[;,\s]/.test(report.href) ? [["report-uri", report.href]] : []),
  ];
  return directives.map(directive => directive.join(" ")).join("; ");
}

export function securityHeaders(env: HeaderEnv): { key: string; value: string }[] {
  return [
    // Same value the audit observed on the production domain. includeSubDomains
    // and preload commit every subdomain and stay a founder decision.
    { key: "Strict-Transport-Security", value: "max-age=63072000" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // The camera stays available to this origin for the arrival scanner.
    { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
    // Framing is blocked for real: report-only policies do not enforce frame-ancestors.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    { key: "Content-Security-Policy-Report-Only", value: reportOnlyContentSecurityPolicy(env) },
  ];
}

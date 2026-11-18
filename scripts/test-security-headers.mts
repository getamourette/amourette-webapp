import assert from "node:assert/strict";
// @ts-expect-error Node's direct TypeScript runner requires the file extension.
import { reportOnlyContentSecurityPolicy, securityHeaders } from "../lib/security-headers.ts";

const directive = (policy: string, name: string) =>
  policy.split("; ").find(part => part.startsWith(`${name} `))?.split(" ").slice(1);

const production = { NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co" };
const policy = reportOnlyContentSecurityPolicy(production);
// Supabase REST/Auth/Storage and Realtime are the only third-party origins.
assert.deepEqual(directive(policy, "connect-src"), ["'self'", "blob:", "https://project.supabase.co", "wss://project.supabase.co"]);
assert.deepEqual(directive(policy, "img-src"), ["'self'", "data:", "blob:", "https://project.supabase.co"]);
assert.deepEqual(directive(policy, "script-src"), ["'self'", "'unsafe-inline'"]);
assert.deepEqual(directive(policy, "frame-ancestors"), ["'none'"]);
assert.deepEqual(directive(policy, "object-src"), ["'none'"]);
assert.equal(directive(policy, "report-uri"), undefined);
// Ignored in report-only policies and logged as an error by browsers.
assert.ok(!policy.includes("upgrade-insecure-requests"));
assert.ok(!/[\r\n]/.test(policy));

// Only development needs eval; a local stack keeps the matching WebSocket scheme.
const development = reportOnlyContentSecurityPolicy({ NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321/" });
assert.deepEqual(directive(development, "script-src"), ["'self'", "'unsafe-inline'", "'unsafe-eval'"]);
assert.deepEqual(directive(development, "connect-src"), ["'self'", "blob:", "http://127.0.0.1:54321", "ws://127.0.0.1:54321"]);

// A missing or malformed backend URL never produces a broken or permissive policy.
for (const url of [undefined, "", "not a url", "javascript:alert(1)", "data:text/html,x"]) {
  const fallback = reportOnlyContentSecurityPolicy({ NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: url });
  assert.deepEqual(directive(fallback, "connect-src"), ["'self'", "blob:"], String(url));
  assert.deepEqual(directive(fallback, "img-src"), ["'self'", "data:", "blob:"], String(url));
}

// The optional collector is accepted only as one clean HTTP(S) URL.
assert.deepEqual(directive(reportOnlyContentSecurityPolicy({ ...production, CSP_REPORT_URI: "https://reports.example/csp?key=1" }), "report-uri"),
  ["https://reports.example/csp?key=1"]);
for (const uri of ["", "reports", "ftp://reports.example/csp", "https://reports.example/a;script-src *", "https://reports.example/a,b"]) {
  assert.equal(directive(reportOnlyContentSecurityPolicy({ ...production, CSP_REPORT_URI: uri }), "report-uri"), undefined, uri);
}

const headers = new Map(securityHeaders(production).map(header => [header.key, header.value]));
assert.equal(headers.size, 7);
assert.equal(headers.get("Strict-Transport-Security"), "max-age=63072000");
assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
assert.equal(headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
assert.equal(headers.get("X-Frame-Options"), "DENY");
// The enforced policy only blocks framing; everything else is observed.
assert.equal(headers.get("Content-Security-Policy"), "frame-ancestors 'none'");
assert.equal(headers.get("Content-Security-Policy-Report-Only"), policy);
// The arrival scanner needs the camera on this origin.
assert.match(headers.get("Permissions-Policy")!, /(^|, )camera=\(self\)(,|$)/);
console.log("security-headers: all assertions passed");

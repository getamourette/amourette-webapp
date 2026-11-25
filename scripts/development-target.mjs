// The one Supabase project that seed, QA and real-database test tooling may
// touch (#367, SEC-004). The ref is public: it is the host of the development
// URL shipped to every browser. It is a constant, not configuration, so a
// misconfigured environment can never turn another project into an accepted
// target. Production is refused because it is simply not this project.
export const DEVELOPMENT_PROJECT_REF = "szufoicsigmxncghquhj";
const DEVELOPMENT_HOST = `${DEVELOPMENT_PROJECT_REF}.supabase.co`;

// Returns the refusal message, or null when the URL targets the development
// project. The whole host must match: a ref used as a subdomain of another
// domain, a custom domain or a local stack is refused.
export function developmentTargetRefusal(supabaseUrl) {
  let target;
  try {
    target = new URL(supabaseUrl);
  } catch {
    return "Refusing to run: NEXT_PUBLIC_SUPABASE_URL is not a valid URL.";
  }
  if (target.protocol !== "https:" || target.hostname !== DEVELOPMENT_HOST || target.port || target.username || target.password) {
    return (
      "Refusing to run: NEXT_PUBLIC_SUPABASE_URL does not target the development Supabase project. " +
      "Seed, QA and real-database test tooling never runs against another project, production included."
    );
  }
  return null;
}

export function assertDevelopmentTarget(supabaseUrl) {
  const refusal = developmentTargetRefusal(supabaseUrl);
  if (refusal) throw new Error(refusal);
}

// Browser test helper only (tests/helpers/env.ts). CI runs each browser job
// against a disposable `supabase start` stack on the runner's own loopback, so
// that one address is accepted next to the development project. Exactly
// http://127.0.0.1:54321 without credentials: `localhost`, another address,
// another port and https are refused. Seed, QA and real-database test scripts
// keep the stricter check above.
export function browserTestTargetRefusal(supabaseUrl) {
  const refusal = developmentTargetRefusal(supabaseUrl);
  if (!refusal) return null;
  let target;
  try {
    target = new URL(supabaseUrl);
  } catch {
    return refusal;
  }
  const localStack = target.protocol === "http:" && target.hostname === "127.0.0.1" && target.port === "54321"
    && !target.username && !target.password;
  return localStack ? null : refusal;
}

export function assertBrowserTestTarget(supabaseUrl) {
  const refusal = browserTestTargetRefusal(supabaseUrl);
  if (refusal) throw new Error(refusal);
}

// Some test tooling also calls a deployed application with identities it
// created on the development project. Production serves getamourette.com, so
// that host and its subdomains are refused, and the URL must be given
// explicitly: there is no default deployment to fall back to.
const PRODUCTION_SITE_HOST = "getamourette.com";

export function developmentAppRefusal(appUrl) {
  let target;
  try {
    target = new URL(appUrl);
  } catch {
    return "Refusing to run: the application URL is missing or not a valid URL. Pass a Preview deployment URL.";
  }
  const host = target.hostname.toLowerCase().replace(/\.$/, "");
  if (target.protocol !== "https:" || target.username || target.password) {
    return "Refusing to run: the application URL must be an https Preview deployment URL without credentials.";
  }
  if (host === PRODUCTION_SITE_HOST || host.endsWith(`.${PRODUCTION_SITE_HOST}`)) {
    return "Refusing to run: the application URL is the production site. Test tooling never calls production.";
  }
  return null;
}

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

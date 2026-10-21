import type { BrowserContext } from '@playwright/test';

// Entire backend and realtime transport are stubbed; never creates shared users.
export async function mockPhotoOnboarding(context: BrowserContext) {
  const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const id = '00000000-0000-4000-8000-000000000181';
  const user = { id, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {} };
  const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: 4099766400, role: 'authenticated' })).toString('base64url')}.synthetic`;
  const session = { user, access_token: token, refresh_token: 'synthetic', token_type: 'bearer', expires_at: 4099766400, expires_in: 3600 };
  await context.addInitScript(({ session, key }) => {
    localStorage.setItem(key, JSON.stringify(session));
    localStorage.setItem('amourette-locale', 'en');
  }, { session, key: `sb-${backend.hostname.split('.')[0]}-auth-token` });
  await context.route(`${backend.origin}/**`, route => route.fulfill({ json: [] }));
  await context.routeWebSocket(/.*/, socket => socket.close());
  if (process.env.E2E_BASE_URL && process.env.E2E_VERCEL_BYPASS) {
    await context.route(`${new URL(process.env.E2E_BASE_URL).origin}/**`, route => route.continue({
      headers: { ...route.request().headers(), 'x-vercel-protection-bypass': process.env.E2E_VERCEL_BYPASS! },
    }));
  }
}

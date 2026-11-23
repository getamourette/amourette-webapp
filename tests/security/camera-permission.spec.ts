import { test, expect } from '@playwright/test';

// The Permissions-Policy header must keep the real camera API usable for the
// founder arrival scanner. Other camera tests replace getUserMedia in JavaScript,
// which bypasses the header; this one calls Chromium's real implementation with
// its fake capture device. No session, shared data or database is needed: the
// policy applies to the document, whatever the page renders.
test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera'],
});

test('the admin page can open the real camera under the served Permissions-Policy', async ({ page }) => {
  if (process.env.E2E_BASE_URL && process.env.E2E_VERCEL_BYPASS) {
    await page.setExtraHTTPHeaders({ 'x-vercel-protection-bypass': process.env.E2E_VERCEL_BYPASS });
  }
  const response = await page.goto('/admin');
  expect(response?.headers()['permissions-policy']).toContain('camera=(self)');
  const result = await page.evaluate(async () => {
    // Chromium exposes the effective policy; geolocation proves it is enforced.
    const policy = (document as Document & { featurePolicy?: { allowsFeature(name: string): boolean } }).featurePolicy;
    const allowed = { camera: policy?.allowsFeature('camera'), geolocation: policy?.allowsFeature('geolocation') };
    // Same request as app/admin/ArrivalCamera.tsx.
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    const [track] = stream.getVideoTracks();
    const live = track?.readyState === 'live';
    stream.getTracks().forEach(t => t.stop());
    let microphone = 'allowed';
    try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach(t => t.stop()); }
    catch (error) { microphone = (error as DOMException).name; }
    return { allowed, live, microphone };
  });
  expect(result.allowed).toEqual({ camera: true, geolocation: false });
  expect(result.live).toBe(true);
  // microphone=() is enforced, so the header is really active in this browser.
  expect(result.microphone).toBe('NotAllowedError');
});

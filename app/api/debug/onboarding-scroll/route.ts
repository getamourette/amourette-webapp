import { parseScrollBatch, SCROLL_COLUMNS, SCROLL_EVENTS, SCROLL_TAGS } from "@/lib/onboarding-scroll-trace";

export async function POST(request: Request) {
  // This temporary collector belongs only to the protected #216 preview.
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "fix/onboarding-page-load-scroll-position") {
    return new Response(null, { status: 404 });
  }
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return new Response(null, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return new Response(null, { status: 415 });
  }
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16_384) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const batch = parseScrollBatch(JSON.parse(text));
    if (!batch) return new Response(null, { status: 400 });
    // Only the validated projection is logged; never the request body/headers.
    console.info("onboarding-scroll-v2", JSON.stringify({
      ...batch,
      columns: SCROLL_COLUMNS,
      events: SCROLL_EVENTS,
      tags: SCROLL_TAGS,
      deviceColumns: ["screenWidth", "screenHeight", "pixelRatio", "platform"],
      platforms: ["other", "ios", "android"],
    }));
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 400 });
  }
}

// TEMPORARY (#100). Receives the on-device visual-viewport trace produced by
// the chat page under ?vvdebug=1 and writes it to the deployment's runtime
// logs, so the keyboard behaviour can be read off a real iPhone with
// `vercel logs` instead of asking a founder for screenshots.
//
// Remove together with the client-side overlay before this PR is Ready for
// review. It stores nothing, and the payload is viewport geometry only.
export async function POST(request: Request) {
  let lines: string[] = [];
  try {
    const body = (await request.json()) as { lines?: unknown };
    if (Array.isArray(body.lines)) {
      lines = body.lines
        .filter((line): line is string => typeof line === "string")
        .slice(0, 200)
        .map((line) => line.slice(0, 200));
    }
  } catch {
    // A malformed trace is not worth an error page.
  }

  if (lines.length > 0) {
    console.log(`[vvdebug]\n${lines.join("\n")}`);
  }

  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

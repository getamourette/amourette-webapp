import { NextResponse, type NextRequest } from "next/server";
import { adminWorkspaceRouteResponse } from "@/lib/admin-venue-workspace";

export function proxy(request: NextRequest) {
  const response = adminWorkspaceRouteResponse(request.nextUrl.pathname);
  if (!response) return NextResponse.next();
  if (response.status === 308) {
    return NextResponse.redirect(new URL(response.location, request.url), 308);
  }
  return new NextResponse(
    '<!doctype html><html lang="en"><head><meta name="robots" content="noindex"><title>Not found</title></head><body><main><h1>404</h1><p>This page could not be found.</p><a href="/admin">Back to Nights</a></main></body></html>',
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

// Only URL syntax and the legacy alias belong here; founder access stays in RLS.
export const config = {
  matcher: [
    "/admin/venues/:venueId",
    "/admin/venues/:venueId/nights/:nightId",
    "/admin/nights/:nightId",
  ],
};

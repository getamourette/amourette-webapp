import { privateJson } from "@/lib/server/launch-service";

// #184 replaces this integration handoff with its localized reservation screen.
// A GET never marks payment, releases capacity, or discloses a booking.
export function GET() {
  return privateJson({ status: "verification_required", next: "resume_with_original_reservation_access" });
}

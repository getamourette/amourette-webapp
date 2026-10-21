import type { Database } from "@/lib/database.types";
export type Venue = Pick<Database["public"]["Tables"]["venues"]["Row"], "id" | "slug" | "name" | "city" | "timezone" | "is_test_venue">;
export type Night = Pick<Database["public"]["Tables"]["venue_nights"]["Row"], "id" | "venue_id" | "waiting_opens_at" | "guaranteed_launch_at" | "closes_at" | "launch_threshold" | "opened_at" | "terminal_at" | "terminal_reason" | "status">;

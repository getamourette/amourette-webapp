import { createClient } from "@supabase/supabase-js";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_REVIEW_MODEL = "gpt-5.5";

type OpenAiContent = {
  type?: string;
  text?: string;
};

type OpenAiResponseOutput = {
  content?: OpenAiContent[];
};

type OpenAiResponse = {
  output_text?: string;
  output?: OpenAiResponseOutput[];
};

type PhotoReview = {
  approved: boolean;
  reason: string;
};

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ enabled: isPhotoReviewEnabled() });
}

export async function POST(request: Request) {
  if (!isPhotoReviewEnabled()) {
    return Response.json({ approved: true, reason: "review_disabled" });
  }

  const userId = await authenticateRequest(request);
  if (!userId) {
    return Response.json(
      { approved: false, reason: "unauthorized" },
      { status: 401 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("photo");

  if (!(file instanceof File)) {
    return Response.json(
      { approved: false, reason: "missing_photo" },
      { status: 400 }
    );
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return Response.json(
      { approved: false, reason: "unsupported_type" },
      { status: 400 }
    );
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return Response.json(
      { approved: false, reason: "too_large" },
      { status: 400 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { approved: false, reason: "review_not_configured" },
      { status: 503 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const imageUrl = `data:${file.type};base64,${bytes.toString("base64")}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_PHOTO_REVIEW_MODEL ?? DEFAULT_REVIEW_MODEL,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Review this dating app profile photo.",
                "Approve only if it appears to be a real, non-blank photo centered on one visible adult human face.",
                "Reject memes, screenshots, cartoons, logos, black or blank images, heavy filters that hide the face, celebrity/poster images, group photos, explicit sexual content, graphic violence, and images where the person appears under 18.",
                "Do not identify the person. Return only JSON with this exact shape: {\"approved\": boolean, \"reason\": string}.",
              ].join(" "),
            },
            {
              type: "input_image",
              image_url: imageUrl,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    return Response.json(
      { approved: false, reason: "review_failed" },
      { status: 502 }
    );
  }

  const data = (await response.json()) as OpenAiResponse;
  const outputText =
    data.output_text ??
    data.output
      ?.flatMap((item) => item.content ?? [])
      .find((content) => content.type === "output_text")?.text;
  const review = parseReview(outputText);

  if (!review) {
    return Response.json(
      { approved: false, reason: "invalid_review" },
      { status: 502 }
    );
  }

  return Response.json(review);
}

function isPhotoReviewEnabled() {
  return process.env.PROFILE_PHOTO_REVIEW_ENABLED === "true";
}

async function authenticateRequest(request: Request): Promise<string | null> {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) return null;

  const authClient = createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await authClient.auth.getUser(token);
  if (error) return null;

  return data.user?.id ?? null;
}

function parseReview(text: string | undefined): PhotoReview | null {
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "approved" in parsed &&
      "reason" in parsed
    ) {
      const review = parsed as Record<string, unknown>;
      if (
        typeof review.approved === "boolean" &&
        typeof review.reason === "string"
      ) {
        return {
          approved: review.approved,
          reason: review.reason,
        };
      }
    }
  } catch {
    return null;
  }

  return null;
}

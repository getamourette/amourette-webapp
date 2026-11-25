// Optional automated photo review (`PROFILE_PHOTO_REVIEW_ENABLED`). Server-internal
// since #376 (SEC-013): it used to be a public `POST /api/profile-photo/review`
// route with no client caller, where each call was a paid vision request. Only
// publication calls it now, on a bounded JPEG copy it prepared itself.

const DEFAULT_REVIEW_MODEL = "gpt-5.5";

export type PhotoReviewResult = { approved: boolean } | { failed: "not_configured" | "provider" | "invalid_review" };

export function isPhotoReviewEnabled() {
  return process.env.PROFILE_PHOTO_REVIEW_ENABLED === "true";
}

type OpenAiResponse = {
  output_text?: string;
  output?: { content?: { type?: string; text?: string }[] }[];
};

export async function reviewProfilePhoto(jpeg: Uint8Array): Promise<PhotoReviewResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { failed: "not_configured" };
  const imageUrl = `data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}`;
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_PHOTO_REVIEW_MODEL ?? DEFAULT_REVIEW_MODEL,
        input: [{
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
            { type: "input_image", image_url: imageUrl },
          ],
        }],
      }),
    });
  } catch {
    return { failed: "provider" };
  }
  if (!response.ok) return { failed: "provider" };
  let data: OpenAiResponse;
  try { data = (await response.json()) as OpenAiResponse; } catch { return { failed: "invalid_review" }; }
  const text = data.output_text ?? data.output?.flatMap(item => item.content ?? []).find(content => content.type === "output_text")?.text;
  const approved = parseApproval(text);
  return approved === null ? { failed: "invalid_review" } : { approved };
}

function parseApproval(text: string | undefined): boolean | null {
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null && typeof (parsed as Record<string, unknown>).approved === "boolean"
      && typeof (parsed as Record<string, unknown>).reason === "string") return (parsed as { approved: boolean }).approved;
  } catch { /* Not JSON: an invalid review. */ }
  return null;
}

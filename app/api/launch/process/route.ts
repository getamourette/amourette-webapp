import { processAccessEmails } from "@/lib/server/launch-access-mail";
import { processCheckout, processRefund } from "@/lib/server/launch-engine";
import { launchProvider, launchRpc, privateJson, workerAuthorized } from "@/lib/server/launch-service";
import { readBoundedJson, RequestBodyError } from "@/lib/server/request-body";
import { isRecord } from "@/lib/input-validation";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  if (!workerAuthorized(request)) return privateJson({ error: "unauthorized" }, 401);
  try {
    const body = await readBoundedJson(request, 1024);
    if (!isRecord(body) || Object.keys(body).some(k => k !== "limit") || !Number.isInteger(body.limit) ||
      typeof body.limit !== "number" || body.limit < 1 || body.limit > 10) return privateJson({ error: "invalid_request" }, 400);
    const rpc = launchRpc();
    const limit = body.limit;
    async function payments() {
      const { stripe, account } = await launchProvider();
      const deadline = Date.now() + 40000;
      let checkouts = 0, refunds = 0;
      // Financial work and email have independent budgets and failure handling.
      for (let i = 0; i < limit && Date.now() < deadline; i++) {
        const results = await Promise.allSettled([processCheckout(rpc, stripe, account), processRefund(rpc, stripe, account)]);
        if (results[0].status === "fulfilled" && results[0].value) checkouts++;
        if (results[1].status === "fulfilled" && results[1].value) refunds++;
        if (results.some(r => r.status === "rejected")) throw new Error("worker_incomplete");
        if (results.every(r => r.status === "fulfilled" && !r.value)) break;
      }
      await rpc("maintain_launch_checkout", {});
      return { checkouts, refunds };
    }
    const [financial, mail] = await Promise.allSettled([payments(), processAccessEmails(rpc, limit)]);
    const delivery = { email_attempts: mail.status === "fulfilled" ? mail.value : 0, email_error: mail.status === "rejected" };
    if (financial.status === "rejected") return privateJson({ error: "worker_incomplete", ...delivery }, 503);
    return privateJson({ ...financial.value, ...delivery });
  } catch (error) { return privateJson({ error: "worker_incomplete" }, error instanceof RequestBodyError ? error.status : 503); }
}

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isTransientProviderStatus, renderTransactionalEmail, retryAt, type TransactionalNotification } from "./email.ts";

type Job = { id: string; notification_id: string; recipient_user_id: string; attempt_count: number };
type AttemptOutcome = "delivered" | "transient_failure" | "permanent_failure" | "recipient_unavailable";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const errorText = (error: unknown) => error instanceof Error ? error.message.slice(0, 500) : "Unknown transactional email error";

function dispatchSecretMatches(provided: string | null, expected: string): boolean {
  if (!provided || provided.length > 4096) return false;
  const a = new TextEncoder().encode(provided); const b = new TextEncoder().encode(expected);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index++) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const dispatchSecret = Deno.env.get("TRANSACTIONAL_EMAIL_DISPATCH_SECRET");
  if (!dispatchSecret || !dispatchSecretMatches(req.headers.get("x-freshgo-dispatch-secret"), dispatchSecret)) return json({ error: "Unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL"); const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY"); const from = Deno.env.get("TRANSACTIONAL_EMAIL_FROM");
  if (!url || !serviceRole || !resendApiKey || !from) return json({ error: "Transactional email sender is not configured" }, 503);
  const db = createClient(url, serviceRole, { auth: { persistSession: false } });
  const { data: jobs, error: claimError } = await db.rpc("claim_transactional_email_jobs", { p_limit: 25 });
  if (claimError) return json({ error: "Could not claim email jobs" }, 500);
  const outcomes: Record<string, number> = { delivered: 0, retried: 0, failed: 0, unavailable: 0 };

  async function finish(job: Job, outcome: AttemptOutcome, updates: Record<string, unknown>, responseStatus?: number, providerMessageId?: string, errorCode?: string) {
    const { error: attemptError } = await db.from("transactional_email_attempts").insert({ job_id: job.id, attempt_number: job.attempt_count, outcome, response_status: responseStatus ?? null, provider_message_id: providerMessageId ?? null, error_code: errorCode ?? null });
    if (attemptError) throw new Error(`Could not record email attempt: ${attemptError.message}`);
    const { error: jobError } = await db.from("transactional_email_jobs").update(updates).eq("id", job.id);
    if (jobError) throw new Error(`Could not update email job: ${jobError.message}`);
  }

  for (const job of (jobs ?? []) as Job[]) {
    try {
      const { data: notification, error: notificationError } = await db.from("notifications").select("id,notification_type,title,message,action_url").eq("id", job.notification_id).maybeSingle<TransactionalNotification>();
      if (notificationError) throw notificationError;
      if (!notification) { await finish(job, "permanent_failure", { status: "failed", locked_at: null, last_error: "Notification no longer exists" }, undefined, undefined, "notification_missing"); outcomes.failed++; continue; }
      const { data: user, error: userError } = await db.auth.admin.getUserById(job.recipient_user_id);
      if (userError) throw userError;
      const recipient = user.user?.email;
      if (!recipient) { await finish(job, "recipient_unavailable", { status: "failed", locked_at: null, last_error: "Recipient email is unavailable" }, undefined, undefined, "recipient_unavailable"); outcomes.unavailable++; continue; }

      const rendered = renderTransactionalEmail(notification);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json", "Idempotency-Key": `freshgo-transactional-email-${job.id}` },
        body: JSON.stringify({ from, to: [recipient], subject: rendered.subject, html: rendered.html, text: rendered.text, tags: [{ name: "notification_type", value: notification.notification_type.slice(0, 256) }] }),
      });
      const body = await response.json().catch(() => ({})) as { id?: string; message?: string };
      if (response.ok && body.id) { await finish(job, "delivered", { status: "delivered", delivered_at: new Date().toISOString(), locked_at: null, last_error: null, provider_message_id: body.id }, response.status, body.id); outcomes.delivered++; continue; }
      const reason = typeof body.message === "string" ? body.message.slice(0, 500) : `Resend returned HTTP ${response.status}`;
      if (isTransientProviderStatus(response.status) && job.attempt_count < 5) { await finish(job, "transient_failure", { status: "pending", next_attempt_at: retryAt(job.attempt_count), locked_at: null, last_error: "Transient email delivery failure" }, response.status, undefined, reason); outcomes.retried++; }
      else { await finish(job, "permanent_failure", { status: "failed", locked_at: null, last_error: isTransientProviderStatus(response.status) ? "Retry limit reached" : "Email delivery rejected" }, response.status, undefined, reason); outcomes.failed++; }
    } catch (error) {
      console.error("transactional_email_dispatch_failure", { jobId: job.id, message: errorText(error) });
      outcomes.failed++;
    }
  }
  return json({ processed: (jobs ?? []).length, outcomes });
});

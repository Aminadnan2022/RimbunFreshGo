import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { errorDetails, errorText, PersistenceError, persisted, recordDeliveryAttempt } from "./persistence.ts";

type Job = { id: string; notification_id: string; subscription_id: string; attempt_count: number };
type NotificationRow = { id: string; title: string; message: string; action_url: string | null };
type Subscription = { id: string; endpoint: string; p256dh: string; auth: string; disabled_at: string | null; failure_count: number };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const transient = (status: number | undefined) => status === 408 || status === 429 || (status !== undefined && status >= 500);
const retryAt = (attempt: number) => new Date(Date.now() + Math.min(30 * 60, 30 * 2 ** Math.max(0, attempt - 1)) * 1000).toISOString();

// Edge runtime has no Node crypto.timingSafeEqual. This avoids early-exit comparison.
function dispatchSecretMatches(provided: string | null, expected: string): boolean {
  if (!provided || provided.length > 4096) return false;
  const a = new TextEncoder().encode(provided); const b = new TextEncoder().encode(expected);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index++) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const dispatchSecret = Deno.env.get("WEB_PUSH_DISPATCH_SECRET");
  if (!dispatchSecret || !dispatchSecretMatches(req.headers.get("x-freshgo-dispatch-secret"), dispatchSecret)) return json({ error: "Unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL"); const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublic = Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY"); const vapidPrivate = Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY"); const vapidSubject = Deno.env.get("WEB_PUSH_VAPID_SUBJECT");
  if (!url || !serviceRole || !vapidPublic || !vapidPrivate || !vapidSubject) return json({ error: "Web Push sender is not configured" }, 503);
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  const db = createClient(url, serviceRole, { auth: { persistSession: false } });
  const { data: jobs, error: claimError } = await db.rpc("claim_web_push_delivery_jobs", { p_limit: 25 });
  if (claimError) return json({ error: "Could not claim delivery jobs" }, 500);
  const outcomes: Record<string, number> = { delivered: 0, retried: 0, failed: 0, expired: 0 };

  for (const job of (jobs ?? []) as Job[]) {
    try {
      const { data: notification, error: notificationError } = await db.from("notifications").select("id,title,message,action_url").eq("id", job.notification_id).maybeSingle<NotificationRow>();
      if (notificationError) throw new Error(`Could not load notification: ${errorText(notificationError)}`);
      if (!notification) {
        await persisted(db.from("web_push_delivery_jobs").update({ status: "failed", locked_at: null, last_error: "Notification no longer exists" }).eq("id", job.id), "Could not fail missing notification job");
        outcomes.failed++; continue;
      }
      const { data: subscription, error: subscriptionError } = await db.from("push_subscriptions").select("id,endpoint,p256dh,auth,disabled_at,failure_count").eq("id", job.subscription_id).maybeSingle<Subscription>();
      if (subscriptionError) {
        const terminal = job.attempt_count >= 5;
        await persisted(db.from("web_push_delivery_jobs").update(terminal ? { status: "failed", locked_at: null, last_error: "Subscription query retry limit reached" } : { status: "pending", next_attempt_at: retryAt(job.attempt_count), locked_at: null, last_error: "Could not load subscription" }).eq("id", job.id), "Could not persist subscription query failure");
        outcomes[terminal ? "failed" : "retried"]++; continue;
      }
      if (!subscription || subscription.disabled_at) {
        await recordDeliveryAttempt(db.from("web_push_delivery_attempts").insert({ job_id: job.id, subscription_id: job.subscription_id, outcome: "no_active_subscriptions" }));
        await persisted(db.from("web_push_delivery_jobs").update({ status: "delivered", delivered_at: new Date().toISOString(), locked_at: null, last_error: null }).eq("id", job.id), "Could not complete inactive subscription job");
        outcomes.delivered++; continue;
      }
      const payload = JSON.stringify({ notificationId: notification.id, title: notification.title.slice(0, 120), body: notification.message.slice(0, 280), action: notification.action_url || "/notifications" });
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: 300, urgency: "high" });
        await recordDeliveryAttempt(db.from("web_push_delivery_attempts").insert({ job_id: job.id, subscription_id: subscription.id, outcome: "delivered", response_status: 201 }));
        await persisted(db.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failure_count: 0, last_failure_at: null, last_failure_reason: null }).eq("id", subscription.id), "Could not update delivered subscription");
        await persisted(db.from("web_push_delivery_jobs").update({ status: "delivered", delivered_at: new Date().toISOString(), locked_at: null, last_error: null }).eq("id", job.id), "Could not complete delivered job");
        outcomes.delivered++;
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : undefined;
        const reason = errorText(error);
        if (status === 404 || status === 410) {
          await recordDeliveryAttempt(db.from("web_push_delivery_attempts").insert({ job_id: job.id, subscription_id: subscription.id, outcome: "expired", response_status: status, error_code: "endpoint_gone" }));
          await persisted(db.from("push_subscriptions").update({ disabled_at: new Date().toISOString(), last_failure_at: new Date().toISOString(), last_failure_reason: "endpoint_gone" }).eq("id", subscription.id), "Could not disable expired endpoint");
          await persisted(db.from("web_push_delivery_jobs").update({ status: "delivered", delivered_at: new Date().toISOString(), locked_at: null, last_error: null }).eq("id", job.id), "Could not complete expired job");
          outcomes.expired++;
        } else if (transient(status) && job.attempt_count < 5) {
          await recordDeliveryAttempt(db.from("web_push_delivery_attempts").insert({ job_id: job.id, subscription_id: subscription.id, outcome: "transient_failure", response_status: status ?? null, error_code: reason }));
          await persisted(db.from("web_push_delivery_jobs").update({ status: "pending", next_attempt_at: retryAt(job.attempt_count), locked_at: null, last_error: "Transient push delivery failure" }).eq("id", job.id), "Could not schedule retry");
          outcomes.retried++;
        } else {
          await recordDeliveryAttempt(db.from("web_push_delivery_attempts").insert({ job_id: job.id, subscription_id: subscription.id, outcome: "permanent_failure", response_status: status ?? null, error_code: reason }));
          await persisted(db.from("push_subscriptions").update({ failure_count: subscription.failure_count + 1, last_failure_at: new Date().toISOString(), last_failure_reason: transient(status) ? "Retry limit reached" : reason }).eq("id", subscription.id), "Could not update failed subscription");
          await persisted(db.from("web_push_delivery_jobs").update({ status: "failed", locked_at: null, last_error: transient(status) ? "Retry limit reached" : reason }).eq("id", job.id), "Could not fail delivery job");
          outcomes.failed++;
        }
      }
    } catch (error) {
      // Do not pretend a persistence failure succeeded: leave the lease visible for recovery.
      console.error("web_push_persistence_failure_v4", { jobId: job.id, ...errorDetails(error) });
      outcomes.failed++;
    }
  }
  return json({ processed: (jobs ?? []).length, outcomes });
});

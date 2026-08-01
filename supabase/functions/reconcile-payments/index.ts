import { handleOptions, isAllowedOrigin, jsonResponse } from "../_shared/cors.ts";
import { fulfilSuccessfulPayment, mapProviderStatus, verifyPaystackReference } from "../_shared/payments.ts";
import { getAuthenticatedUser, getUserAccountStatus, getUserRole, isVerifiedAdminSession, writeAuditLog } from "../_shared/security.ts";
import { createServiceClient } from "../_shared/supabase.ts";

function clean(value: unknown) {
  return String(value || "").trim();
}

function timingSafeEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

async function authorize(request: Request, supabase: any) {
  const configuredSecret = clean(Deno.env.get("PAYMENT_RECONCILIATION_SECRET"));
  const suppliedSecret = clean(request.headers.get("x-reconciliation-secret"));
  if (configuredSecret && suppliedSecret && timingSafeEqual(configuredSecret, suppliedSecret)) {
    return { authorized: true, userId: null, mode: "scheduled" };
  }

  const auth = await getAuthenticatedUser(request, supabase);
  if (!auth.user) return { authorized: false, userId: null, mode: "manual" };
  const role = await getUserRole(supabase, auth.user.id);
  const accountStatus = await getUserAccountStatus(supabase, auth.user.id);
  const verified = role === "admin" && accountStatus === "active"
    && await isVerifiedAdminSession(supabase, auth.user.id, auth.sessionId);
  return { authorized: verified, userId: verified ? auth.user.id : null, mode: "manual" };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405, request);
  if (!isAllowedOrigin(request) && !request.headers.get("x-reconciliation-secret")) {
    return jsonResponse({ error: "Origin is not allowed." }, 403, request);
  }

  const supabase = createServiceClient();
  let runId = "";
  try {
    const access = await authorize(request, supabase);
    if (!access.authorized) return jsonResponse({ error: "Admin verification is required." }, 403, request);
    const body = await request.json().catch(() => ({}));
    if (body.configureSchedule === true) {
      const scheduleSecret = clean(Deno.env.get("PAYMENT_RECONCILIATION_SECRET"));
      if (!scheduleSecret) return jsonResponse({ ok: false, error: "Payment reconciliation is not configured." }, 503, request);
      const { data: jobId, error: scheduleError } = await supabase.rpc("configure_payment_reconciliation_schedule", { schedule_secret: scheduleSecret });
      if (scheduleError) throw scheduleError;
      return jsonResponse({ ok: true, scheduled: true, jobId }, 200, request);
    }
    const dryRun = body.dryRun !== false;
    const limit = Math.min(50, Math.max(1, Number(body.limit) || 25));
    const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: run, error: runError } = await supabase.from("payment_reconciliation_runs").insert({
      started_by: access.userId,
      run_mode: dryRun ? "dry_run" : access.mode,
      status: "running"
    }).select("id").single();
    if (runError) throw runError;
    runId = run.id;

    const { data: payments, error } = await supabase
      .from("payments")
      .select("*")
      .in("status", ["initialized", "pending", "processing", "ongoing"])
      .lt("created_at", staleBefore)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw error;

    const report: any[] = [];
    let verifiedCount = 0;
    let pendingCount = 0;
    let failedCount = 0;
    for (const payment of payments || []) {
      try {
        const provider = await verifyPaystackReference(payment.reference);
        const providerStatus = mapProviderStatus(provider.data?.status);
        if (providerStatus === "success") {
          verifiedCount += 1;
          if (!dryRun) await fulfilSuccessfulPayment(supabase, payment, provider.data, "reconciliation");
        } else if (providerStatus === "failed" || providerStatus === "reversed" || providerStatus === "abandoned") {
          failedCount += 1;
          if (!dryRun) {
            await supabase.from("payments").update({
              status: providerStatus,
              provider_status: provider.data?.status || providerStatus,
              verification_status: "rejected",
              reconciliation_required: false,
              failure_reason: "Payment was not confirmed by the payment provider."
            }).eq("id", payment.id);
          }
        } else {
          pendingCount += 1;
          if (!dryRun) await supabase.from("payments").update({ reconciliation_required: true }).eq("id", payment.id);
        }
        report.push({ reference: payment.reference, status: providerStatus });
      } catch {
        failedCount += 1;
        report.push({ reference: payment.reference, status: "verification_failed" });
        if (!dryRun) await supabase.from("payments").update({ reconciliation_required: true }).eq("id", payment.id);
      }
    }

    await supabase.from("payment_reconciliation_runs").update({
      status: failedCount && (payments || []).length > failedCount ? "partial" : failedCount ? "failed" : "completed",
      scanned_count: (payments || []).length,
      verified_count: verifiedCount,
      pending_count: pendingCount,
      failed_count: failedCount,
      completed_at: new Date().toISOString(),
      summary: { dryRun, report }
    }).eq("id", runId);

    await writeAuditLog(supabase, {
      actorUserId: access.userId,
      action: dryRun ? "payment_reconciliation_dry_run" : "payment_reconciliation_completed",
      targetTable: "payment_reconciliation_runs",
      targetId: runId,
      metadata: { scanned: (payments || []).length, verified: verifiedCount, pending: pendingCount, failed: failedCount }
    });

    return jsonResponse({ ok: true, dryRun, scanned: (payments || []).length, verified: verifiedCount, pending: pendingCount, failed: failedCount, report }, 200, request);
  } catch (error) {
    console.error("reconcile-payments", (error as Error).message);
    if (runId) await supabase.from("payment_reconciliation_runs").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", runId);
    return jsonResponse({ ok: false, error: "Payment reconciliation could not be completed." }, 400, request);
  }
});

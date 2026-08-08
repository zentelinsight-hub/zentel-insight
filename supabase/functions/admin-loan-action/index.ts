import { handleOptions, isAllowedOrigin, jsonResponse } from "../_shared/cors.ts";
import { assertVerifiedAdmin } from "../_shared/security.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean = (value: unknown) => String(value || "").trim();

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405, request);
  if (!isAllowedOrigin(request)) return jsonResponse({ error: "Origin is not allowed." }, 403, request);

  try {
    const admin = await assertVerifiedAdmin(request);
    if (!admin.ok) return jsonResponse({ error: admin.error }, admin.status, request);

    const body = await request.json().catch(() => ({}));
    const action = clean(body.action).toLowerCase();
    const applicationId = clean(body.applicationId);
    const repaymentId = clean(body.repaymentId) || null;
    if (!uuidPattern.test(applicationId)) return jsonResponse({ error: "Choose a valid loan application." }, 400, request);

    if (action === "review") {
      const [{ data: application, error: applicationError }, { data: kycRows, error: kycError }] = await Promise.all([
        admin.supabase.from("loan_applications").select("*").eq("id", applicationId).maybeSingle(),
        admin.supabase.rpc("service_get_loan_kyc", { target_application_id: applicationId })
      ]);
      if (applicationError || kycError) throw applicationError || kycError;
      const kyc = kycRows?.[0];
      if (!application || !kyc) return jsonResponse({ error: "Loan KYC information was not found." }, 404, request);
      const paths = [kyc.passport_photo_path, kyc.identification_path];
      const signed = await Promise.all(paths.map(async (path) => {
        const { data, error } = await admin.supabase.storage.from("loan-kyc").createSignedUrl(path, 300);
        if (error) throw error;
        return data?.signedUrl || "";
      }));
      await admin.supabase.from("loan_applications").update({ status: "pending_review", kyc_status: "reviewed", updated_at: new Date().toISOString() }).eq("id", applicationId).in("status", ["submitted", "pending_review"]);
      return jsonResponse({
        application,
        kyc: { nin: kyc.nin, bvn: kyc.bvn, passportPhotoUrl: signed[0], identificationUrl: signed[1] }
      }, 200, request);
    }

    if (action === "approve" || action === "decline") {
      const { data: kycRows, error: kycError } = await admin.supabase.rpc("service_get_loan_kyc", { target_application_id: applicationId });
      if (kycError) throw kycError;
      const kyc = kycRows?.[0];
      if (!kyc) return jsonResponse({ error: "KYC has already been purged or was not found." }, 409, request);
      const paths = [kyc.passport_photo_path, kyc.identification_path].filter(Boolean);
      const { error: removalError } = await admin.supabase.storage.from("loan-kyc").remove(paths);
      if (removalError) throw removalError;

      const { data, error } = await admin.supabase.rpc("service_finalize_loan_decision", {
        target_application_id: applicationId,
        decision: action === "approve" ? "approved" : "declined",
        decision_approved_amount: action === "approve" ? Number(body.approvedAmount || 0) : null,
        decision_due_date: action === "approve" ? clean(body.dueDate) : null,
        decision_reason: action === "decline" ? clean(body.reason) : "",
        actor_user_id: admin.user.id
      });
      if (error) throw error;
      return jsonResponse({ application: data, message: action === "approve" ? "Loan approved." : "Loan declined." }, 200, request);
    }

    const actionMap: Record<string, string> = {
      disburse: "disbursed",
      overdue: "mark_overdue",
      "confirm-repayment": "confirm_repayment",
      "reject-repayment": "reject_repayment"
    };
    const databaseAction = actionMap[action];
    if (!databaseAction) return jsonResponse({ error: "Unsupported loan action." }, 400, request);
    if (repaymentId && !uuidPattern.test(repaymentId)) return jsonResponse({ error: "Choose a valid repayment." }, 400, request);

    const { data, error } = await admin.supabase.rpc("service_update_loan_state", {
      target_application_id: applicationId,
      action: databaseAction,
      target_repayment_id: repaymentId,
      actor_user_id: admin.user.id
    });
    if (error) throw error;
    return jsonResponse({ application: data, message: "Loan status updated." }, 200, request);
  } catch (error) {
    console.error("admin-loan-action failed", { message: error instanceof Error ? error.message : "Unknown failure" });
    return jsonResponse({ error: error instanceof Error ? error.message : "The loan action could not be completed." }, 500, request);
  }
});

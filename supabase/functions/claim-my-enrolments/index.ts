import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const supabase = createServiceClient();
    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) return jsonResponse({ error: "Authentication is required." }, 401);

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) return jsonResponse({ error: "Authentication is required." }, 401);

    const user = userData.user;
    const verifiedEmail = normalizeEmail(user.email || "");
    if (!verifiedEmail || (!user.email_confirmed_at && !user.confirmed_at)) {
      return jsonResponse({ error: "A verified email is required." }, 403);
    }

    const { data: payments, error: paymentsError } = await supabase
      .from("payments")
      .select("id")
      .in("brand", ["zentel", "zentel_insight"])
      .eq("product_type", "zentel_course")
      .eq("status", "success")
      .is("user_id", null)
      .eq("customer_email", verifiedEmail);

    if (paymentsError) throw paymentsError;
    const paymentIds = (payments || []).map((payment: any) => payment.id);
    if (!paymentIds.length) return jsonResponse({ linked: 0, message: "No unclaimed paid enrolments found." });

    const { error: paymentsUpdateError } = await supabase
      .from("payments")
      .update({ user_id: user.id })
      .in("id", paymentIds)
      .is("user_id", null);

    if (paymentsUpdateError) throw paymentsUpdateError;

    const { data: enrolments, error: enrolmentUpdateError } = await supabase
      .from("enrolments")
      .update({ user_id: user.id, status: "active" })
      .in("payment_id", paymentIds)
      .is("user_id", null)
      .eq("status", "paid_unlinked")
      .select("id");

    if (enrolmentUpdateError) throw enrolmentUpdateError;

    return jsonResponse({
      linked: enrolments?.length || 0,
      message: "Paid enrolments refreshed."
    });
  } catch (error) {
    console.error("claim-my-enrolments", error.message);
    return jsonResponse({ error: "Paid enrolments could not be linked." }, 400);
  }
});

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

    const { data: linked, error: claimError } = await supabase.rpc("claim_verified_payments", {
      target_user_id: user.id,
      verified_email: verifiedEmail
    });
    if (claimError) throw claimError;

    return jsonResponse({
      linked: Number(linked || 0),
      message: Number(linked || 0) ? "Paid enrolments refreshed." : "No unclaimed paid enrolments found."
    });
  } catch (error) {
    console.error("claim-my-enrolments", error.message);
    return jsonResponse({ error: "Paid enrolments could not be linked." }, 400);
  }
});

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Authentication is required." }, 401);

    const supabase = createServiceClient();
    const token = authHeader.replace("Bearer ", "");
    const { data: userResult, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userResult.user) return jsonResponse({ error: "Invalid session." }, 401);

    const { error } = await supabase.auth.admin.deleteUser(userResult.user.id);
    if (error) throw error;

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("delete-account", error.message);
    return jsonResponse({ error: "Account could not be deleted." }, 400);
  }
});

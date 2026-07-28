import { handleOptions, isAllowedOrigin, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { getAuthenticatedUser, getUserAccountStatus, writeAuditLog } from "../_shared/security.ts";

function clean(value: unknown) {
  return String(value || "").trim();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed." }, 405, request);
  if (!isAllowedOrigin(request)) return jsonResponse({ ok: false, error: "Origin is not allowed." }, 403, request);

  try {
    const supabase = createServiceClient();
    const auth = await getAuthenticatedUser(request, supabase);
    if (!auth.user) return jsonResponse({ ok: false, error: auth.error }, 401, request);
    if (await getUserAccountStatus(supabase, auth.user.id) !== "active") {
      return jsonResponse({ ok: false, error: "Your account is inactive." }, 403, request);
    }

    const body = await request.json().catch(() => ({}));
    const classSessionId = clean(body.classSessionId);
    if (!classSessionId) return jsonResponse({ ok: false, error: "A live class session is required." }, 400, request);

    const now = new Date().toISOString();
    const { data: attendance, error } = await supabase
      .from("live_class_attendance")
      .update({ left_at: now, attendance_status: "left" })
      .eq("class_session_id", classSessionId)
      .eq("user_id", auth.user.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!attendance) return jsonResponse({ ok: false, error: "No active attendance record was found for this class." }, 404, request);

    await writeAuditLog(supabase, {
      actorUserId: auth.user.id,
      action: "live_class_left",
      targetTable: "live_class_sessions",
      targetId: classSessionId
    });

    return jsonResponse({ ok: true, leftAt: now }, 200, request);
  } catch (error) {
    console.error("leave-live-class", (error as Error).message);
    return jsonResponse({ ok: false, error: "Live-class attendance could not be updated." }, 400, request);
  }
});

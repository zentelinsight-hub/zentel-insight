import { handleOptions, isAllowedOrigin, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { getAuthenticatedUser, getUserAccountStatus, getUserRole, isVerifiedAdminSession, writeAuditLog } from "../_shared/security.ts";

function clean(value: unknown) {
  return String(value || "").trim();
}

async function isAssignedTutorForSession(supabase: any, userId: string, session: any) {
  if (session.tutor_id !== userId) return false;
  const { data, error } = await supabase
    .from("tutor_program_assignments")
    .select("id, track_id")
    .eq("tutor_id", userId)
    .eq("program_id", session.program_id)
    .eq("active", true);
  if (error) throw error;
  return (data || []).some((assignment: any) => !assignment.track_id || !session.track_id || assignment.track_id === session.track_id);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed." }, 405, request);
  if (!isAllowedOrigin(request)) return jsonResponse({ ok: false, error: "Origin is not allowed." }, 403, request);

  try {
    const supabase = createServiceClient();
    const auth = await getAuthenticatedUser(request, supabase);
    if (!auth.user) return jsonResponse({ ok: false, error: auth.error }, 401, request);

    const role = await getUserRole(supabase, auth.user.id);
    const accountStatus = await getUserAccountStatus(supabase, auth.user.id);
    if (accountStatus !== "active") {
      return jsonResponse({ ok: false, error: "Your account is inactive." }, 403, request);
    }
    if (role === "admin" && !(await isVerifiedAdminSession(supabase, auth.user.id, auth.sessionId))) {
      return jsonResponse({ ok: false, error: "Admin security verification is required." }, 403, request);
    }

    const body = await request.json().catch(() => ({}));
    const classSessionId = clean(body.classSessionId);
    if (!classSessionId) return jsonResponse({ ok: false, error: "A live class session is required." }, 400, request);

    const { data: session, error: sessionError } = await supabase
      .from("live_class_sessions")
      .select("*")
      .eq("id", classSessionId)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) return jsonResponse({ ok: false, error: "Live class was not found." }, 404, request);

    const canEnd = role === "admin" || (role === "tutor" && await isAssignedTutorForSession(supabase, auth.user.id, session));
    if (!canEnd) return jsonResponse({ ok: false, error: "Only the assigned Tutor or verified Admin can end this class." }, 403, request);

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("live_class_sessions")
      .update({
        status: "completed",
        join_closes_at: now
      })
      .eq("id", session.id)
      .select("*")
      .maybeSingle();
    if (updateError) throw updateError;

    await supabase
      .from("live_class_attendance")
      .update({
        left_at: now,
        attendance_status: "left"
      })
      .eq("class_session_id", session.id)
      .eq("user_id", auth.user.id);

    await writeAuditLog(supabase, {
      actorUserId: auth.user.id,
      action: "live_class_ended",
      targetTable: "live_class_sessions",
      targetId: session.id
    });

    return jsonResponse({ ok: true, session: updated }, 200, request);
  } catch (error) {
    console.error("end-live-class", (error as Error).message);
    return jsonResponse({ ok: false, error: "Live class could not be ended." }, 400, request);
  }
});

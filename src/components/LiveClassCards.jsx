import { useState } from "react";
import { Video } from "lucide-react";
import { canJoinLiveClass, endLiveClass, getLiveClassState, requestLiveClassToken } from "../services/liveClassService";
import { formatDateTime } from "../utils/format";

function getProgramName(item) {
  return item?.programs?.title || item?.program_title || "Programme";
}

function getTutorName(item) {
  const profile = item?.profiles;
  if (!profile) return "";
  const firstName = String(profile.full_name || "").trim().split(/\s+/)[0] || "Tutor";
  return `${profile.title || ""} ${firstName}`.trim();
}

function getProviderName(provider) {
  if (provider === "google_meet") return "Google Meet";
  if (provider === "zoom") return "Zoom";
  if (provider === "youtube") return "YouTube";
  return provider || "Online";
}

export default function LiveClassCards({ sessions = [], emptyMessage = "No live classes have been scheduled yet.", audience = "student", onChanged, onEdit, onCancel }) {
  const [status, setStatus] = useState({ id: "", type: "", message: "" });
  const [loadingId, setLoadingId] = useState("");
  const hostView = audience === "tutor" || audience === "admin";

  async function joinClass(session) {
    setLoadingId(session.id);
    setStatus({ id: session.id, type: "", message: "" });
    try {
      const result = await requestLiveClassToken(session.id);
      if (!result.ok) {
        setStatus({ id: session.id, type: "warning", message: result.message || "Live-class access is not ready." });
        return;
      }
      const targetUrl = result.token
        ? `${result.roomUrl}${result.roomUrl.includes("?") ? "&" : "?"}t=${encodeURIComponent(result.token)}`
        : result.roomUrl;
      const openedWindow = window.open(targetUrl, "_blank");
      if (!openedWindow) {
        setStatus({ id: session.id, type: "warning", message: "Your browser blocked the class window. Allow pop-ups for Zentel Insight and try again." });
        return;
      }
      try {
        openedWindow.opener = null;
      } catch {
        // Cross-origin browser protections may prevent updating opener.
      }
      setStatus({ id: session.id, type: "success", message: result.permission === "host" ? "Class opened. Zentel will not close the external meeting for you." : "Opening the authorised class link." });
      onChanged?.();
    } catch (error) {
      setStatus({ id: session.id, type: "warning", message: error.message || "Live-class access could not be prepared." });
    } finally {
      setLoadingId("");
    }
  }

  async function endClass(session) {
    setLoadingId(`end:${session.id}`);
    setStatus({ id: session.id, type: "", message: "" });
    try {
      const result = await endLiveClass(session.id);
      if (!result.ok) {
        setStatus({ id: session.id, type: "warning", message: result.message || "Live class could not be ended." });
        return;
      }
      setStatus({ id: session.id, type: "success", message: result.message || "Live class ended in Zentel Insight." });
      onChanged?.();
    } catch (error) {
      setStatus({ id: session.id, type: "warning", message: error.message || "Live class could not be ended." });
    } finally {
      setLoadingId("");
    }
  }

  function getJoinLabel(session, state) {
    if (!hostView) return "Join Class";
    if (state === "live" || session.status === "live") return audience === "admin" ? "Join as Host" : "Join as Host";
    return "Start Class";
  }

  if (!sessions.length) {
    return (
      <div className="notice-card portal-state-card">
        <h2>No live classes</h2>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="portal-list">
      {sessions.map((session) => {
        const state = getLiveClassState(session);
        const joinable = canJoinLiveClass(session) && (hostView || session.status === "live");
        return (
          <article className="portal-record-card" key={session.id}>
            <div>
              <p className="eyebrow">{getProgramName(session)} | {session.timezone || "Africa/Lagos"}</p>
              <h3>{session.title}</h3>
              <p>{session.description || "Live online class session."}</p>
            </div>
            <dl className="portal-mini-details">
              <div><dt>Starts</dt><dd>{formatDateTime(session.scheduled_start)}</dd></div>
              <div><dt>Ends</dt><dd>{formatDateTime(session.scheduled_end)}</dd></div>
              <div><dt>Status</dt><dd>{state}</dd></div>
              <div><dt>Platform</dt><dd>{getProviderName(session.provider)}</dd></div>
              {hostView ? <div><dt>Students joined</dt><dd>{Number(session.joinedStudentCount ?? session.joined_student_count ?? session.live_class_attendance?.filter((item) => item.attendance_status !== "missed").length ?? 0)}</dd></div> : null}
              {getTutorName(session) ? <div><dt>Tutor</dt><dd>{getTutorName(session)}</dd></div> : null}
              {session.actual_started_at ? <div><dt>Actually started</dt><dd>{formatDateTime(session.actual_started_at)}</dd></div> : null}
              {session.actual_ended_at ? <div><dt>Actually ended</dt><dd>{formatDateTime(session.actual_ended_at)}</dd></div> : null}
            </dl>
            {joinable ? (
              <button className="button button-primary" type="button" onClick={() => joinClass(session)} disabled={loadingId === session.id}>
                {loadingId === session.id ? "Preparing Class" : getJoinLabel(session, state)}
                <Video size={18} aria-hidden="true" />
              </button>
            ) : (
              <span className="portal-tag">Join opens near class time</span>
            )}
            {hostView && (state === "live" || session.status === "live") ? (
              <button className="button button-secondary" type="button" onClick={() => endClass(session)} disabled={loadingId === `end:${session.id}`}>
                {loadingId === `end:${session.id}` ? "Ending Class" : "End Class"}
              </button>
            ) : null}
            {audience === "tutor" && session.status === "scheduled" && onEdit ? <button className="button button-secondary" type="button" onClick={() => onEdit(session)}>Edit</button> : null}
            {audience === "tutor" && session.status === "scheduled" && onCancel ? <button className="button button-secondary" type="button" disabled={loadingId !== ""} onClick={() => onCancel(session)}>Cancel</button> : null}
            {status.id === session.id && status.message ? (
              <div className={`form-status ${status.type || "warning"}`} role="status">{status.message}</div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

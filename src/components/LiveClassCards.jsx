import { useState } from "react";
import { Video } from "lucide-react";
import { canJoinLiveClass, endLiveClass, getLiveClassState, leaveLiveClass, requestLiveClassToken } from "../services/liveClassService";
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

export default function LiveClassCards({ sessions = [], emptyMessage = "No live classes have been scheduled yet.", audience = "student", onChanged }) {
  const [status, setStatus] = useState({ id: "", type: "", message: "" });
  const [loadingId, setLoadingId] = useState("");
  const [joinedSessionIds, setJoinedSessionIds] = useState(() => new Set());
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
      const separator = result.roomUrl.includes("?") ? "&" : "?";
      const openedWindow = window.open(`${result.roomUrl}${separator}t=${encodeURIComponent(result.token)}`, "_blank");
      if (!openedWindow) {
        setStatus({ id: session.id, type: "warning", message: "Your browser blocked the class window. Allow pop-ups for Zentel Insight and try again." });
        return;
      }
      try {
        openedWindow.opener = null;
      } catch {
        // Cross-origin browser protections may prevent updating opener.
      }
      if (!hostView) setJoinedSessionIds((current) => new Set(current).add(session.id));
      setStatus({ id: session.id, type: "success", message: `Opening live class as ${result.permission}.` });
      onChanged?.();
    } catch (error) {
      setStatus({ id: session.id, type: "warning", message: error.message || "Live-class access could not be prepared." });
    } finally {
      setLoadingId("");
    }
  }

  async function leaveClass(session) {
    setLoadingId(`leave:${session.id}`);
    setStatus({ id: session.id, type: "", message: "" });
    try {
      const result = await leaveLiveClass(session.id);
      if (!result.ok) {
        setStatus({ id: session.id, type: "warning", message: result.message || "Class attendance could not be updated." });
        return;
      }
      setJoinedSessionIds((current) => {
        const next = new Set(current);
        next.delete(session.id);
        return next;
      });
      setStatus({ id: session.id, type: "success", message: "You have left the live class." });
      onChanged?.();
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
      setStatus({ id: session.id, type: "success", message: "Live class ended." });
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
        const joinable = canJoinLiveClass(session);
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
              {getTutorName(session) ? <div><dt>Tutor</dt><dd>{getTutorName(session)}</dd></div> : null}
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
            {!hostView && joinedSessionIds.has(session.id) ? (
              <button className="button button-secondary" type="button" onClick={() => leaveClass(session)} disabled={loadingId === `leave:${session.id}`}>
                {loadingId === `leave:${session.id}` ? "Leaving Class" : "Leave Class"}
              </button>
            ) : null}
            {status.id === session.id && status.message ? (
              <div className={`form-status ${status.type || "warning"}`} role="status">{status.message}</div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

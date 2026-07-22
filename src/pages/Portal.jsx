import { createPortal } from "react-dom";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Award,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Moon,
  Newspaper,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  UserRound,
  Video,
  X
} from "lucide-react";
import LiveClassCards from "../components/LiveClassCards";
import ProgramChatPanel from "../components/ProgramChatPanel";
import { useAuth } from "../context/authHooks";
import { useTheme } from "../context/themeHooks";
import { siteConfig } from "../data/site";
import {
  useProgramCatalog,
  usePortalPageContent,
  usePortalArticles,
  useStudentAnnouncements,
  useStudentAssignments,
  useStudentCertificates,
  useStudentClassroom,
  useStudentDashboard,
  useStudentEnrolments,
  useStudentLiveClasses,
  useStudentNotifications,
  useStudentPayments,
  useStudentPreferences,
  useStudentProgramPreference,
  useStudentProfile,
  useStudentResources,
  useStudentSupportTickets,
  useStudentTimetable
} from "../hooks/portal/usePortalData";
import {
  createSupportTicket,
  calculateProfileCompletion,
  hasReliablePaymentStatus,
  markAllNotificationsRead,
  markNotificationRead,
  saveStudentProgramPreference,
  updateStudentPreferences,
  updateStudentProfile
} from "../services/portal/portalRepository";
import { claimMyEnrolments, requestPasswordReset } from "../services/authService";
import { readStoredLastActivity, writeStoredLastActivity, clearStoredSessionSecurity } from "../services/sessionSecurity";
import { formatCurrency, formatDateTime, isValidEmail } from "../utils/format";
import { usePageMeta } from "../utils/usePageMeta";
import BrandLogo from "../components/BrandLogo";

const portalLinks = [
  ["/portal", "Dashboard", LayoutDashboard],
  ["/portal/profile", "My Profile", UserRound],
  ["/portal/my-courses", "My Course", GraduationCap],
  ["/portal/classroom", "Classroom", MessageSquare],
  ["/portal/timetable", "Timetable", CalendarDays],
  ["/portal/announcements", "Announcements", Megaphone],
  ["/portal/assignments", "Assignments", FileCheck2],
  ["/portal/resources", "Resources", BookOpen],
  ["/portal/payments", "Payments", CreditCard],
  ["/portal/certificates", "Certificates", Award],
  ["/portal/notifications", "Notifications", Bell],
  ["/portal/articles", "Learning Articles", Newspaper],
  ["/portal/support", "Support", LifeBuoy],
  ["/portal/settings", "Settings", Settings]
];

const pageMeta = {
  dashboard: "/portal",
  profile: "/portal/profile",
  "my-courses": "/portal/my-courses",
  classroom: "/portal/classroom",
  timetable: "/portal/timetable",
  announcements: "/portal/announcements",
  assignments: "/portal/assignments",
  resources: "/portal/resources",
  payments: "/portal/payments",
  certificates: "/portal/certificates",
  notifications: "/portal/notifications",
  articles: "/portal/articles",
  support: "/portal/support",
  settings: "/portal/settings"
};

export const PORTAL_IDLE_TIMEOUT_MS = 20 * 60 * 1000;
export const PORTAL_IDLE_WARNING_MS = 18 * 60 * 1000;
const PORTAL_ACTIVITY_THROTTLE_MS = 1000;
const portalChannelName = "zentel-portal-session";
const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatDate(value) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(date);
}

function formatTime(value) {
  if (!value) return "Time pending";
  return String(value).slice(0, 5);
}

function formatScheduleDay(item) {
  if (item?.class_date) return formatDate(item.class_date);
  const day = Number(item?.day_of_week);
  return Number.isInteger(day) && day >= 0 && day < dayNames.length ? dayNames[day] : "Schedule pending";
}

function getFirstName(profile, user) {
  const name = profile?.full_name || user?.email || "Learner";
  return String(name).trim().split(/\s+/)[0] || "Learner";
}

function getCourseName(item) {
  return item?.programs?.title || item?.program_title || item?.product_name || "Zentel Insight programme";
}

function getTrackName(item) {
  return item?.program_levels?.level_name || item?.selected_level || item?.track_name || "Track not specified";
}

function getInitials(profile, user) {
  const source = profile?.full_name || user?.email || "Learner";
  const words = String(source).replace(/@.*/, "").trim().split(/\s+/).filter(Boolean);
  return (words[0]?.[0] || "L").concat(words[1]?.[0] || "").toUpperCase();
}

function isValidMeetingUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function getProgrammeSummary(enrolments = [], programmePreference = null) {
  const active = enrolments.filter((item) => item.status === "active");
  if (active.length) return `${active.length} active programme${active.length === 1 ? "" : "s"}`;
  if (programmePreference?.programs?.title) return programmePreference.programs.title;
  if (enrolments.length) return "Programme records pending activation";
  return "No programme linked yet";
}

function getProgrammeSourceLabel(source) {
  if (source === "official") return "Official enrolment";
  if (source === "self_selected") return "Self-selected preference";
  return "Not selected";
}

function formatClassSummary(item) {
  if (!item) return "No class";
  return `${formatScheduleDay(item)} ${formatTime(item.start_time)} - ${formatTime(item.end_time)}`;
}

function dispatchPortalDataRefresh() {
  window.dispatchEvent(new Event("zentel:portal-data-refresh"));
}

function openProgrammeSelector() {
  window.dispatchEvent(new Event("zentel:portal-open-programme-selector"));
}

function ProgrammeSelector({ programs = [], value, onChange, disabled = false }) {
  const [search, setSearch] = useState("");
  const filteredPrograms = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return programs;
    return programs.filter((program) => {
      const haystack = `${program.title || ""} ${program.short_description || ""} ${program.category || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [programs, search]);

  return (
    <div className="programme-selector">
      <label>
        <span>Search programmes</span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Type a programme name"
          disabled={disabled}
        />
      </label>
      <div className="programme-option-list" role="listbox" aria-label="Available programmes">
        {filteredPrograms.map((program) => {
          const active = value === program.id;
          return (
            <button
              key={program.id}
              className={active ? "active" : ""}
              type="button"
              role="option"
              aria-selected={active}
              disabled={disabled}
              onClick={() => onChange(program.id)}
            >
              <span>{program.title}</span>
              {program.short_description ? <small>{program.short_description}</small> : null}
            </button>
          );
        })}
        {!filteredPrograms.length ? <p>No programme matches your search.</p> : null}
      </div>
    </div>
  );
}

function ProgrammeSelectionModal({ programs, programsLoading, programsError, onRetryPrograms, onSave }) {
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const saveButtonRef = useRef(null);

  useEffect(() => {
    saveButtonRef.current?.focus();
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (!selectedProgramId) {
      setStatus({ type: "warning", message: "Select your programme before saving." });
      return;
    }
    setSaving(true);
    setStatus({ type: "", message: "" });
    try {
      await onSave(selectedProgramId);
      setStatus({ type: "success", message: "Programme saved." });
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Programme could not be saved." });
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="programme-modal-backdrop" role="presentation">
      <form className="programme-modal" role="dialog" aria-modal="true" aria-labelledby="programme-modal-title" onSubmit={submit}>
        <div>
          <p className="eyebrow">Student Portal</p>
          <h2 id="programme-modal-title">Choose Your Programme</h2>
          <p>Select the Zentel Insight programme you are currently studying so your timetable, announcements and learning information can be personalised.</p>
        </div>
        {programsLoading ? <PortalLoading label="Loading programmes" /> : null}
        {programsError ? (
          <div className="form-status warning" role="alert">
            Programme list could not be loaded.
            <button className="text-link" type="button" onClick={onRetryPrograms}>Try again</button>
          </div>
        ) : null}
        {!programsLoading && !programsError ? (
          <ProgrammeSelector
            programs={programs}
            value={selectedProgramId}
            onChange={(programId) => {
              setSelectedProgramId(programId);
              setStatus({ type: "", message: "" });
            }}
            disabled={saving}
          />
        ) : null}
        {status.message ? <div className={`form-status ${status.type}`} role="status">{status.message}</div> : null}
        <button ref={saveButtonRef} className="button button-primary" type="submit" disabled={saving || programsLoading || Boolean(programsError)}>
          {saving ? "Saving Programme" : "Save Programme"}
        </button>
      </form>
    </div>,
    document.body
  );
}

function PortalAvatar({ profile, user, size = "md" }) {
  const initials = getInitials(profile, user);
  return (
    <span className={`portal-avatar ${size}`}>
      {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : <span>{initials}</span>}
    </span>
  );
}

function PortalSidebarContent({ profile, user, enrolments, programmePreference, onNavigate, onSignOut }) {
  const displayName = profile?.full_name || user?.email || "Learner";
  return (
    <>
      <Link className="brand" to="/portal" onClick={onNavigate}>
        <BrandLogo brand="main" size="portal" />
        <span>
          <span className="brand-name">Student Portal</span>
          <span className="brand-motto">Zentel Insight</span>
        </span>
      </Link>
      <div className="portal-sidebar-profile">
        <PortalAvatar profile={profile} user={user} />
        <div>
          <strong>{displayName}</strong>
          <span>{getProgrammeSummary(enrolments, programmePreference)}</span>
        </div>
      </div>
      <nav aria-label="Student portal">
        {portalLinks.map(([href, label, Icon]) => (
          <NavLink key={href} to={href} end={href === "/portal"} onClick={onNavigate} className={({ isActive }) => isActive ? "portal-link active" : "portal-link"}>
            <Icon size={18} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>
      <button className="portal-link signout" type="button" onClick={onSignOut}>
        <LogOut size={18} aria-hidden="true" />
        Sign Out
      </button>
    </>
  );
}

function PortalLoading({ label = "Loading information" }) {
  return (
    <div className="portal-skeleton" role="status" aria-live="polite">
      <span>{label}</span>
      <div />
      <div />
      <div />
    </div>
  );
}

function PortalError({ message, onRetry }) {
  if (import.meta.env.DEV && message) console.info("Portal visible error state", message);
  return (
    <div className="notice-card portal-state-card">
      <p className="eyebrow">Student Portal</p>
      <h2>We could not load this information</h2>
      <p>Refresh this section and try again. If the issue continues, contact Zentel Insight support.</p>
      <button className="button button-primary" type="button" onClick={onRetry}>Try Again</button>
    </div>
  );
}

function PortalEmpty({ content, action }) {
  return (
    <div className="notice-card portal-state-card">
      <p className="eyebrow">Nothing to show yet</p>
      <h2>{content?.empty_title || "Your portal section is ready"}</h2>
      <p>{content?.empty_message || "Approved student information will appear here when it is connected to your account."}</p>
      {action}
    </div>
  );
}

function PortalPage({ slug, children, actions }) {
  const contentQuery = usePortalPageContent(slug);
  const content = contentQuery.data;

  usePageMeta({
    path: pageMeta[slug] || "/portal",
    title: content?.title || "Student Portal",
    description: content?.description || "Zentel Insight Student Portal.",
    robots: "noindex,nofollow"
  });

  return (
    <div className="portal-page">
      <div className="portal-page-heading">
        <div>
          <p className="eyebrow">Student Portal</p>
          <h2>{content?.title || "Student Portal"}</h2>
          <p>{content?.description || "Your private Zentel Insight account information is loaded securely."}</p>
        </div>
        {actions}
      </div>
      {contentQuery.error ? <PortalError message={contentQuery.error} onRetry={contentQuery.refetch} /> : children(content)}
    </div>
  );
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function IdleWarningModal({ remainingMs, onStaySignedIn, onSignOutNow }) {
  const stayButtonRef = useRef(null);
  const signOutButtonRef = useRef(null);

  useEffect(() => {
    stayButtonRef.current?.focus();
  }, []);

  function handleKeyDown(event) {
    if (event.key !== "Tab") return;
    const focusable = [stayButtonRef.current, signOutButtonRef.current].filter(Boolean);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div className="idle-modal-backdrop" role="presentation">
      <section className="idle-modal" role="dialog" aria-modal="true" aria-labelledby="idle-warning-title" onKeyDown={handleKeyDown}>
        <ShieldCheck size={28} aria-hidden="true" />
        <div>
          <p className="eyebrow">Session security</p>
          <h2 id="idle-warning-title">Are you still there?</h2>
          <p>For your security, you will be signed out in {formatCountdown(remainingMs)} because there has been no activity.</p>
        </div>
        <div className="button-row">
          <button ref={stayButtonRef} className="button button-primary" type="button" onClick={onStaySignedIn}>
            Stay Signed In
          </button>
          <button ref={signOutButtonRef} className="button button-secondary" type="button" onClick={onSignOutNow}>
            Sign Out Now
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

function usePortalIdleSession({ enabled, signOut, onBeforeSignOut }) {
  const navigate = useNavigate();
  const [warningOpen, setWarningOpen] = useState(false);
  const [remainingMs, setRemainingMs] = useState(PORTAL_IDLE_TIMEOUT_MS - PORTAL_IDLE_WARNING_MS);
  const channelRef = useRef(null);
  const warningTimerRef = useRef(null);
  const logoutTimerRef = useRef(null);
  const countdownRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const logoutAtRef = useRef(Date.now() + PORTAL_IDLE_TIMEOUT_MS);
  const lastBroadcastRef = useRef(0);
  const signingOutRef = useRef(false);

  const clearTimers = useCallback(() => {
    window.clearTimeout(warningTimerRef.current);
    window.clearTimeout(logoutTimerRef.current);
    window.clearInterval(countdownRef.current);
  }, []);

  const broadcast = useCallback((type) => {
    const message = { type, sentAt: Date.now() };
    channelRef.current?.postMessage(message);
    try {
      localStorage.setItem(`${portalChannelName}:event`, JSON.stringify(message));
    } catch {
      // localStorage may be unavailable in private browser modes.
    }
  }, []);

  const runLocalSignOut = useCallback(async (shouldBroadcast = true) => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    clearTimers();
    setWarningOpen(false);
    onBeforeSignOut?.();
    clearStoredSessionSecurity();
    if (shouldBroadcast) broadcast("signed_out");
    await signOut({ scope: "local" });
    navigate("/login?reason=idle", { replace: true });
  }, [broadcast, clearTimers, navigate, onBeforeSignOut, signOut]);

  const showWarning = useCallback((shouldBroadcast = true) => {
    logoutAtRef.current = lastActivityRef.current + PORTAL_IDLE_TIMEOUT_MS;
    setRemainingMs(Math.max(0, logoutAtRef.current - Date.now()));
    setWarningOpen(true);
    window.clearInterval(countdownRef.current);
    countdownRef.current = window.setInterval(() => {
      const nextRemaining = Math.max(0, logoutAtRef.current - Date.now());
      setRemainingMs(nextRemaining);
      if (nextRemaining <= 0) void runLocalSignOut(true);
    }, 1000);
    if (shouldBroadcast) broadcast("warning");
  }, [broadcast, runLocalSignOut]);

  const resetTimers = useCallback((shouldBroadcast = true) => {
    if (!enabled || signingOutRef.current) return;
    clearTimers();
    lastActivityRef.current = Date.now();
    writeStoredLastActivity(lastActivityRef.current);
    logoutAtRef.current = lastActivityRef.current + PORTAL_IDLE_TIMEOUT_MS;
    setWarningOpen(false);
    setRemainingMs(PORTAL_IDLE_TIMEOUT_MS - PORTAL_IDLE_WARNING_MS);
    warningTimerRef.current = window.setTimeout(() => showWarning(true), PORTAL_IDLE_WARNING_MS);
    logoutTimerRef.current = window.setTimeout(() => void runLocalSignOut(true), PORTAL_IDLE_TIMEOUT_MS);
    if (shouldBroadcast) broadcast("activity");
  }, [broadcast, clearTimers, enabled, runLocalSignOut, showWarning]);

  const recordActivity = useCallback(() => {
    if (!enabled || signingOutRef.current) return;
    const now = Date.now();
    if (now - lastBroadcastRef.current < PORTAL_ACTIVITY_THROTTLE_MS) return;
    lastBroadcastRef.current = now;
    resetTimers(true);
  }, [enabled, resetTimers]);

  useEffect(() => {
    if (!enabled) return undefined;
    signingOutRef.current = false;
    const storedActivity = readStoredLastActivity();
    if (storedActivity && Date.now() - storedActivity >= PORTAL_IDLE_TIMEOUT_MS) {
      void runLocalSignOut(true);
      return undefined;
    }
    if (storedActivity) {
      lastActivityRef.current = storedActivity;
      writeStoredLastActivity(storedActivity);
      const elapsed = Date.now() - storedActivity;
      if (elapsed >= PORTAL_IDLE_WARNING_MS) showWarning(false);
      else resetTimers(false);
    } else {
      resetTimers(false);
    }

    const events = ["pointerdown", "keydown", "touchstart", "scroll", "wheel", "mousemove", "visibilitychange", "focus"];
    events.forEach((eventName) => window.addEventListener(eventName, recordActivity, { passive: true }));

    if ("BroadcastChannel" in window) {
      channelRef.current = new BroadcastChannel(portalChannelName);
      channelRef.current.onmessage = (event) => {
        if (event.data?.type === "activity" || event.data?.type === "stay_signed_in") resetTimers(false);
        if (event.data?.type === "warning") showWarning(false);
        if (event.data?.type === "signed_out") void runLocalSignOut(false);
      };
    }

    function handleStorage(event) {
      if (event.key !== `${portalChannelName}:event` || !event.newValue) return;
      try {
        const data = JSON.parse(event.newValue);
        if (data.type === "activity" || data.type === "stay_signed_in") resetTimers(false);
        if (data.type === "warning") showWarning(false);
        if (data.type === "signed_out") void runLocalSignOut(false);
      } catch {
        // Ignore malformed cross-tab events.
      }
    }

    window.addEventListener("storage", handleStorage);

    return () => {
      clearTimers();
      events.forEach((eventName) => window.removeEventListener(eventName, recordActivity));
      window.removeEventListener("storage", handleStorage);
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, [clearTimers, enabled, recordActivity, resetTimers, runLocalSignOut, showWarning]);

  const staySignedIn = useCallback(() => {
    resetTimers(true);
    broadcast("stay_signed_in");
  }, [broadcast, resetTimers]);

  const signOutNow = useCallback(() => {
    void runLocalSignOut(true);
  }, [runLocalSignOut]);

  return { warningOpen, remainingMs, staySignedIn, signOutNow };
}

export function PortalLayout() {
  const { authReady, authLoading, loading, profile, user, signOut } = useAuth();
  const location = useLocation();
  const drawerId = useId().replace(/:/g, "");
  const menuButtonRef = useRef(null);
  const scrollYRef = useRef(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [canUsePortal, setCanUsePortal] = useState(false);
  const [claimingEnrolments, setClaimingEnrolments] = useState(true);
  const [manualProgrammeModalOpen, setManualProgrammeModalOpen] = useState(false);
  const enrolmentsQuery = useStudentEnrolments(user?.id);
  const programCatalogQuery = useProgramCatalog();
  const programPreferenceQuery = useStudentProgramPreference(user?.id);
  const enrolments = enrolmentsQuery.data || [];
  const refetchEnrolments = enrolmentsQuery.refetch;
  const programmePreference = programPreferenceQuery.data;
  const hasActiveOfficialProgramme = enrolments.some((item) => item.status === "active");
  const authFinished = Boolean(user?.id) && authReady !== false && !authLoading && !loading;
  const programmeCheckFinished = authFinished && !claimingEnrolments && !enrolmentsQuery.loading && !programPreferenceQuery.loading;
  const needsProgrammeOnboarding = programmeCheckFinished && !hasActiveOfficialProgramme && !programmePreference?.program_id;
  const showProgrammeModal = needsProgrammeOnboarding || manualProgrammeModalOpen;
  const displayName = profile?.full_name || user?.email || "Learner";
  const { warningOpen, remainingMs, staySignedIn, signOutNow } = usePortalIdleSession({
    enabled: Boolean(user?.id),
    signOut,
    onBeforeSignOut: () => setMenuOpen(false)
  });

  useEffect(() => {
    let active = true;
    setClaimingEnrolments(true);
    claimMyEnrolments()
      .then(() => {
        refetchEnrolments();
        dispatchPortalDataRefresh();
      })
      .catch((error) => {
        if (import.meta.env.DEV) console.info("Portal enrolment claim failed", error);
      })
      .finally(() => {
        if (active) setClaimingEnrolments(false);
      });
    return () => {
      active = false;
    };
  // Refetch functions are stable in the real hook; user id is the intended claim boundary.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    function handleOpenProgrammeSelector() {
      setManualProgrammeModalOpen(true);
    }
    window.addEventListener("zentel:portal-open-programme-selector", handleOpenProgrammeSelector);
    return () => window.removeEventListener("zentel:portal-open-programme-selector", handleOpenProgrammeSelector);
  }, []);

  async function saveProgrammePreference(programId) {
    await saveStudentProgramPreference(user.id, { program_id: programId });
    setManualProgrammeModalOpen(false);
    programPreferenceQuery.refetch();
    refetchEnrolments();
    dispatchPortalDataRefresh();
  }

  useEffect(() => {
    setCanUsePortal(true);
    document.body.classList.add("portal-route-active");
    return () => document.body.classList.remove("portal-route-active");
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 920.01px)");
    function handleResize(event) {
      if (event.matches) setMenuOpen(false);
    }
    handleResize(mediaQuery);
    mediaQuery.addEventListener("change", handleResize);
    return () => mediaQuery.removeEventListener("change", handleResize);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const restoreFocusTarget = menuButtonRef.current;
    function handleKeyDown(event) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    scrollYRef.current = window.scrollY;
    document.addEventListener("keydown", handleKeyDown);
    document.body.classList.add("portal-menu-open");
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollYRef.current}px`;
    document.body.style.width = "100%";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("portal-menu-open");
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      window.scrollTo(0, scrollYRef.current);
      restoreFocusTarget?.focus();
    };
  }, [menuOpen]);

  usePageMeta({
    path: "/portal",
    title: "Student Portal",
    description: "Protected Zentel Insight student portal.",
    robots: "noindex,nofollow"
  });

  function closeMenu() {
    setMenuOpen(false);
  }

  function handleSignOut() {
    closeMenu();
    void signOut();
  }

  const desktopSidebar = (
    <aside className="portal-sidebar portal-sidebar-desktop">
      <PortalSidebarContent
        profile={profile}
        user={user}
        enrolments={enrolments}
        programmePreference={programmePreference}
        onNavigate={closeMenu}
        onSignOut={handleSignOut}
      />
    </aside>
  );

  const mobileDrawer = menuOpen && canUsePortal
    ? createPortal(
      <>
        <button
          className="portal-drawer-backdrop"
          type="button"
          aria-label="Close portal menu"
          onClick={closeMenu}
        />
        <aside id={drawerId} className="portal-sidebar portal-mobile-drawer open" aria-label="Student portal menu">
          <PortalSidebarContent
            profile={profile}
            user={user}
            enrolments={enrolments}
            programmePreference={programmePreference}
            onNavigate={closeMenu}
            onSignOut={handleSignOut}
          />
        </aside>
      </>,
      document.body
    )
    : null;

  return (
    <section className="portal-shell">
      {desktopSidebar}
      {mobileDrawer}
      <main className="portal-main">
        <header className="portal-header">
          <button
            ref={menuButtonRef}
            className="icon-button portal-menu-button"
            type="button"
            aria-label={menuOpen ? "Close portal menu" : "Open portal menu"}
            aria-expanded={menuOpen}
            aria-controls={drawerId}
            onClick={() => setMenuOpen((current) => !current)}
          >
            {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
          <div>
            <p className="eyebrow">Welcome back</p>
            <h1>{displayName}</h1>
          </div>
          <PortalAvatar profile={profile} user={user} size="sm" />
        </header>
        <Outlet />
      </main>
      {showProgrammeModal ? (
        <ProgrammeSelectionModal
          programs={programCatalogQuery.data || []}
          programsLoading={programCatalogQuery.loading}
          programsError={programCatalogQuery.error}
          onRetryPrograms={programCatalogQuery.refetch}
          onSave={saveProgrammePreference}
        />
      ) : null}
      {warningOpen ? <IdleWarningModal remainingMs={remainingMs} onStaySignedIn={staySignedIn} onSignOutNow={signOutNow} /> : null}
    </section>
  );
}

export function PortalOverview() {
  const { user, profile } = useAuth();
  const dashboard = useStudentDashboard(user?.id);
  const completion = calculateProfileCompletion(profile);

  return (
    <PortalPage slug="dashboard">
      {(content) => {
        if (dashboard.loading) return <PortalLoading label="Loading dashboard" />;
        if (dashboard.error) return <PortalError message={dashboard.error} onRetry={dashboard.refetch} />;
        const data = dashboard.data;
        if (!data) return <PortalEmpty content={content} />;
        const activeEnrolments = data.activeEnrolments || [];
        const announcements = data.announcements || [];
        const certificates = data.certificates || [];
        const payments = data.payments || [];
        const pendingAssignments = data.pendingAssignments || [];
        const resources = data.resources || [];
        const timetable = data.timetable || [];
        const unreadNotifications = data.unreadNotifications || [];
        const resolvedProgrammeName = data.resolvedProgramme?.title || activeEnrolments[0]?.programs?.title || "Choose programme";
        return (
          <>
            <section className="portal-welcome-card">
              <PortalAvatar profile={profile} user={user} size="lg" />
              <div>
                <p className="eyebrow">Welcome back, {getFirstName(profile, user)}</p>
                <h3>Your learner workspace is ready</h3>
                <p>Review your active programmes, published class information, account notices and support records from one secure portal.</p>
              </div>
            </section>
            <div className="dashboard-grid">
              <article className="dashboard-card">
                <GraduationCap size={22} aria-hidden="true" />
                <span>My Programme</span>
                <strong>{resolvedProgrammeName}</strong>
                <small>{getProgrammeSourceLabel(data.programmeSource)}</small>
              </article>
              <article className="dashboard-card">
                <Clock3 size={22} aria-hidden="true" />
                <span>Next Class</span>
                <strong>{data.upcomingClass ? formatTime(data.upcomingClass.start_time) : "Not published"}</strong>
                <small>{data.upcomingClass ? `${formatScheduleDay(data.upcomingClass)} - ${getCourseName(data.upcomingClass)}` : data.needsProgrammeSelection ? "Choose your programme first." : "No timetable yet."}</small>
              </article>
              <article className="dashboard-card">
                <CalendarDays size={22} aria-hidden="true" />
                <span>Today&apos;s Class</span>
                <strong>{data.todayClass ? formatTime(data.todayClass.start_time) : "No class today"}</strong>
                <small>{data.todayClass ? `${getCourseName(data.todayClass)} ends ${formatTime(data.todayClass.end_time)}` : "Check the weekly timetable."}</small>
              </article>
              <article className="dashboard-card">
                <LayoutDashboard size={22} aria-hidden="true" />
                <span>Timetable</span>
                <strong>View Full Timetable</strong>
                <small>{timetable.length ? `${timetable.length} weekly class ${timetable.length === 1 ? "entry" : "entries"}.` : "Open your class schedule."}</small>
                <Link to="/portal/timetable">Open Timetable</Link>
              </article>
            </div>
            <div className="portal-grid">
              <article className="notice-card">
                <h3>Next class</h3>
                {data.upcomingClass ? (
                  <>
                    <p>{getCourseName(data.upcomingClass)} on {formatScheduleDay(data.upcomingClass)} from {formatTime(data.upcomingClass.start_time)} to {formatTime(data.upcomingClass.end_time)} {data.upcomingClass.timezone || "Africa/Lagos"}.</p>
                    {data.upcomingClass.meeting_provider ? <span className="portal-tag">{data.upcomingClass.meeting_provider}</span> : null}
                    {isValidMeetingUrl(data.upcomingClass.meeting_url) ? <a className="button button-secondary" href={data.upcomingClass.meeting_url} target="_blank" rel="noreferrer">Join Class</a> : null}
                  </>
                ) : (
                  <p>Your next class appears after an approved timetable entry is published for your programme.</p>
                )}
                <Link className="text-link" to="/portal/timetable">View Timetable</Link>
              </article>
              <article className="notice-card">
                <h3>Learning status</h3>
                <dl className="portal-mini-details">
                  <div><dt>Profile</dt><dd>{completion}%</dd></div>
                  <div><dt>Active courses</dt><dd>{activeEnrolments.length}</dd></div>
                  <div><dt>Assignments</dt><dd>{pendingAssignments.length}</dd></div>
                  <div><dt>Resources</dt><dd>{resources.length}</dd></div>
                  <div><dt>Certificates</dt><dd>{certificates.length}</dd></div>
                  <div><dt>Unread notices</dt><dd>{unreadNotifications.length}</dd></div>
                </dl>
              </article>
              <article className="notice-card">
                <h3>Recent announcements</h3>
                {announcements.length ? (
                  <ul className="portal-clean-list">
                    {announcements.map((item) => <li key={item.id}>{item.title}</li>)}
                  </ul>
                ) : (
                  <p>Official notices for your account are listed after publication.</p>
                )}
                <Link className="text-link" to="/portal/announcements">Read notices</Link>
              </article>
              <article className="notice-card">
                <h3>Payment summary</h3>
                {payments.length ? (
                  <p>{payments.filter(hasReliablePaymentStatus).length} trusted payment record{payments.filter(hasReliablePaymentStatus).length === 1 ? "" : "s"} linked to your student account.</p>
                ) : (
                  <p>Verified payment records linked to your account will appear after confirmation.</p>
                )}
                <Link className="text-link" to="/portal/payments">View Payments</Link>
              </article>
              <article className="notice-card">
                <h3>Quick links</h3>
                <div className="portal-quick-links">
                  <Link to="/portal/timetable">View Timetable</Link>
                  <Link to="/portal/my-courses">Open My Courses</Link>
                  <Link to="/portal/assignments">View Assignments</Link>
                  <Link to="/portal/resources">Browse Resources</Link>
                  <Link to="/portal/support">Contact Support</Link>
                  <Link to="/portal/profile">Edit Profile</Link>
                </div>
              </article>
              <article className="notice-card">
                <h3>Session security</h3>
                <p>Your portal warns you after 18 minutes of inactivity and signs out the local browser session after 20 minutes.</p>
                <span className="portal-tag success"><Clock3 size={14} aria-hidden="true" /> Active session</span>
              </article>
            </div>
          </>
        );
      }}
    </PortalPage>
  );
}

function StudentClassroomPage() {
  const { user } = useAuth();
  const classroom = useStudentClassroom(user?.id);
  const liveClasses = useStudentLiveClasses(user?.id);

  return (
    <PortalPage slug="classroom">
      {(content) => {
        if (classroom.loading) return <PortalLoading label="Loading classroom" />;
        if (classroom.error) return <PortalError message={classroom.error} onRetry={classroom.refetch} />;
        if (!classroom.data) {
          return (
            <PortalEmpty
              content={{
                ...content,
                empty_title: "Choose a programme to open Classroom",
                empty_message: "Your Classroom appears after an active enrolment is assigned or a programme preference is selected."
              }}
            />
          );
        }

        const tutorName = classroom.data.tutor_id
          ? `${classroom.data.tutor_title || ""} ${classroom.data.tutor_first_name || "Tutor"}`.trim()
          : "A tutor has not yet been assigned to this programme. You will be notified when your classroom becomes available.";

        return (
          <div className="portal-page">
            <div className="portal-page-heading">
              <div>
                <p className="eyebrow">Classroom</p>
                <h2>{classroom.data.program_title}</h2>
                <p>{classroom.data.is_verified_enrolment ? "Official programme classroom." : "Self-selected programme classroom preview. Enrolment remains unverified until Admin assignment or payment confirmation."}</p>
              </div>
              <span className={classroom.data.is_verified_enrolment ? "portal-tag success" : "portal-tag warning"}>
                {classroom.data.is_verified_enrolment ? "Official" : "Unverified"}
              </span>
            </div>
            <div className="dashboard-grid">
              <article className="dashboard-card">
                <GraduationCap size={22} aria-hidden="true" />
                <span>Programme</span>
                <strong>{classroom.data.program_title}</strong>
                <small>{classroom.data.track_name || "All tracks"}</small>
              </article>
              <article className="dashboard-card">
                <UserRound size={22} aria-hidden="true" />
                <span>Tutor</span>
                <strong>{classroom.data.tutor_id ? tutorName : "Pending"}</strong>
                <small>{classroom.data.tutor_specialisation || "Tutor assignment status"}</small>
              </article>
              <article className="dashboard-card">
                <Video size={22} aria-hidden="true" />
                <span>Live Classes</span>
                <strong>{liveClasses.data?.length || 0}</strong>
                <small>Scheduled or live classroom sessions</small>
              </article>
              <article className="dashboard-card">
                <MessageSquare size={22} aria-hidden="true" />
                <span>Programme Chat</span>
                <strong>Realtime</strong>
                <small>Messages are stored in Supabase</small>
              </article>
            </div>
            {!classroom.data.tutor_id ? (
              <div className="notice-card portal-state-card">
                <h2>Tutor assignment pending</h2>
                <p>A tutor has not yet been assigned to this programme. You will be notified when your classroom becomes available.</p>
              </div>
            ) : null}
            {liveClasses.loading ? <PortalLoading label="Loading live classes" /> : null}
            {liveClasses.error ? <PortalError message={liveClasses.error} onRetry={liveClasses.refetch} /> : null}
            {!liveClasses.loading && !liveClasses.error ? (
              <LiveClassCards sessions={liveClasses.data || []} emptyMessage="No classroom live classes have been scheduled yet." />
            ) : null}
            {classroom.data.tutor_id ? (
              <ProgramChatPanel programId={classroom.data.program_id} trackId={classroom.data.track_id} />
            ) : null}
          </div>
        );
      }}
    </PortalPage>
  );
}

function MyCoursesPage() {
  const { user } = useAuth();
  const query = useStudentEnrolments(user?.id);
  const timetable = useStudentTimetable(user?.id);
  const assignments = useStudentAssignments(user?.id);
  const resources = useStudentResources(user?.id);
  return (
    <PortalPage slug="my-courses">
      {(content) => {
        if (query.loading || timetable.loading || assignments.loading || resources.loading) return <PortalLoading label="Loading courses" />;
        if (query.error) return <PortalError message={query.error} onRetry={query.refetch} />;
        const records = query.data || [];
        if (!records.length) return <PortalEmpty content={content} action={<Link className="button button-primary" to="/programs">Browse Programs</Link>} />;
        return (
          <div className="portal-list">
            {records.map((item) => {
              const programId = item.program_id || item.programs?.id;
              const nextClass = (timetable.data?.records || []).find((entry) => entry.program_id === programId);
              const assignmentCount = (assignments.data || []).filter((entry) => entry.program_id === programId).length;
              const resourceCount = (resources.data || []).filter((entry) => entry.program_id === programId).length;
              return (
                <article className="portal-record-card" key={item.id}>
                  <div>
                    <p className="eyebrow">{String(item.status || "pending").replace(/_/g, " ")}</p>
                    <h3>{getCourseName(item)}</h3>
                    <p>{getTrackName(item)}</p>
                  </div>
                  <dl className="portal-mini-details">
                    <div><dt>Enrolled</dt><dd>{formatDate(item.enrolled_date || item.created_at)}</dd></div>
                    <div><dt>Progress</dt><dd>{item.progress_percentage || 0}%</dd></div>
                    <div><dt>Next class</dt><dd>{nextClass ? `${formatScheduleDay(nextClass)} at ${formatTime(nextClass.start_time)}` : "Schedule pending"}</dd></div>
                    <div><dt>Assignments</dt><dd>{assignmentCount}</dd></div>
                    <div><dt>Resources</dt><dd>{resourceCount}</dd></div>
                  </dl>
                  {item.status === "active" && resourceCount > 0 ? <Link className="button button-secondary" to="/portal/resources">Continue Learning</Link> : null}
                </article>
              );
            })}
          </div>
        );
      }}
    </PortalPage>
  );
}

function TimetablePage() {
  const { user } = useAuth();
  const query = useStudentTimetable(user?.id);
  return (
    <PortalPage slug="timetable">
      {(content) => {
        if (query.loading) return <PortalLoading label="Loading timetable" />;
        if (query.error) return <PortalError message={query.error} onRetry={query.refetch} />;
        const timetableData = Array.isArray(query.data) ? { records: query.data } : query.data || {};
        const records = timetableData.records || [];
        const programmeName = timetableData.resolvedProgramme?.title || "Programme not selected";
        if (timetableData.needsProgrammeSelection) {
          return (
            <PortalEmpty
              content={{
                ...content,
                empty_title: "Choose your programme",
                empty_message: "Select your current programme so your timetable can be personalised."
              }}
              action={<button className="button button-primary" type="button" onClick={openProgrammeSelector}>Choose Programme</button>}
            />
          );
        }
        if (!records.length) {
          return (
            <div className="notice-card portal-state-card">
              <p className="eyebrow">{programmeName}</p>
              <h2>No timetable has been published for your programme yet.</h2>
              <p>Published online class times will appear here as soon as they are available.</p>
            </div>
          );
        }
        return (
          <>
            <article className="notice-card timetable-summary-card">
              <div>
                <p className="eyebrow">{getProgrammeSourceLabel(timetableData.source)}</p>
                <h3>{programmeName}</h3>
                <p>{records.length} published weekly class {records.length === 1 ? "entry" : "entries"} in Africa/Lagos time.</p>
              </div>
              {timetableData.nextClass ? (
                <span className="portal-tag success"><Clock3 size={14} aria-hidden="true" /> Next: {formatClassSummary(timetableData.nextClass)}</span>
              ) : null}
            </article>
            <div className="portal-list timetable-card-list">
              {records.map((item) => (
                <article className="portal-record-card timetable-card" key={item.id}>
                  <div>
                    <p className="eyebrow">{formatScheduleDay(item)} | {item.timezone || "Africa/Lagos"}</p>
                    <h3>{item.title}</h3>
                    <p>{getCourseName(item)}{(item.program_levels?.level_name || timetableData.resolvedTrack?.level_name) ? ` - ${item.program_levels?.level_name || timetableData.resolvedTrack.level_name}` : ""}</p>
                    {item.description ? <p>{item.description}</p> : null}
                  </div>
                  <dl className="portal-mini-details">
                    <div><dt>Start</dt><dd>{formatTime(item.start_time)}</dd></div>
                    <div><dt>End</dt><dd>{formatTime(item.end_time)}</dd></div>
                    <div><dt>Delivery</dt><dd>{item.delivery_mode || item.delivery_method || "online"}</dd></div>
                    {item.tutor_name || item.instructor_name ? <div><dt>Tutor</dt><dd>{item.tutor_name || item.instructor_name}</dd></div> : null}
                    {item.meeting_provider ? <div><dt>Provider</dt><dd>{item.meeting_provider}</dd></div> : null}
                  </dl>
                  {isValidMeetingUrl(item.meeting_url) ? <a className="button button-primary" href={item.meeting_url} target="_blank" rel="noreferrer">Join Class</a> : null}
                </article>
              ))}
            </div>
          </>
        );
      }}
    </PortalPage>
  );
}

function AnnouncementsPage() {
  const { user } = useAuth();
  const query = useStudentAnnouncements(user?.id);
  return (
    <PortalPage slug="announcements">
      {(content) => {
        if (query.loading) return <PortalLoading label="Loading announcements" />;
        if (query.error) return <PortalError message={query.error} onRetry={query.refetch} />;
        const records = query.data || [];
        if (!records.length) return <PortalEmpty content={content} />;
        return (
          <div className="portal-list">
            {records.map((item) => (
              <article className="portal-record-card" key={item.id}>
                <p className="eyebrow">{formatDateTime(item.published_at || item.created_at)}</p>
                <h3>{item.title}</h3>
                <p>{item.body || item.summary}</p>
                {item.programs?.title ? <span className="portal-tag">{item.programs.title}</span> : <span className="portal-tag">General</span>}
              </article>
            ))}
          </div>
        );
      }}
    </PortalPage>
  );
}

function AssignmentsPage() {
  const { user } = useAuth();
  const query = useStudentAssignments(user?.id);
  return (
    <PortalPage slug="assignments">
      {(content) => {
        if (query.loading) return <PortalLoading label="Loading assignments" />;
        if (query.error) return <PortalError message={query.error} onRetry={query.refetch} />;
        const records = query.data || [];
        if (!records.length) return <PortalEmpty content={content} />;
        return (
          <div className="portal-list">
            {records.map((item) => {
              const submission = (item.assignment_submissions || []).find((entry) => entry.user_id === user?.id);
              return (
                <article className="portal-record-card" key={item.id}>
                  <div>
                    <p className="eyebrow">{getCourseName(item)}</p>
                    <h3>{item.title}</h3>
                    <p>{item.instructions}</p>
                  </div>
                  <dl className="portal-mini-details">
                    <div><dt>Due</dt><dd>{formatDateTime(item.due_at)}</dd></div>
                    <div><dt>Status</dt><dd>{submission?.status || "Not submitted"}</dd></div>
                    {submission?.score != null ? <div><dt>Score</dt><dd>{submission.score}/{item.maximum_score || 100}</dd></div> : null}
                    {submission?.feedback ? <div><dt>Feedback</dt><dd>{submission.feedback}</dd></div> : null}
                  </dl>
                </article>
              );
            })}
          </div>
        );
      }}
    </PortalPage>
  );
}

function ResourcesPage() {
  const { user } = useAuth();
  const query = useStudentResources(user?.id);
  return (
    <PortalPage slug="resources">
      {(content) => {
        if (query.loading) return <PortalLoading label="Loading resources" />;
        if (query.error) return <PortalError message={query.error} onRetry={query.refetch} />;
        const records = query.data || [];
        if (!records.length) return <PortalEmpty content={content} />;
        return (
          <div className="portal-list">
            {records.map((item) => {
              const href = item.external_url || item.url || "";
              return (
                <article className="portal-record-card" key={item.id}>
                  <div>
                    <p className="eyebrow">{item.module_title || getCourseName(item)}</p>
                    <h3>{item.title}</h3>
                    <p>{item.description || `${item.resource_type} resource`}</p>
                  </div>
                  <span className="portal-tag">{item.resource_type}</span>
                  {href ? <a className="button button-secondary" href={href} target="_blank" rel="noreferrer">Open Resource</a> : null}
                </article>
              );
            })}
          </div>
        );
      }}
    </PortalPage>
  );
}

function ArticlesPage() {
  const { user } = useAuth();
  const query = usePortalArticles(user?.id);
  return (
    <PortalPage slug="articles">
      {(content) => {
        if (query.loading) return <PortalLoading label="Loading learning articles" />;
        if (query.error) return <PortalError message={query.error} onRetry={query.refetch} />;
        const records = query.data || [];
        if (!records.length) return <PortalEmpty content={content} />;
        return (
          <div className="portal-list">
            {records.map((item) => (
              <article className="portal-record-card" key={item.id}>
                <div>
                  <p className="eyebrow">{formatDateTime(item.published_at || item.created_at)}</p>
                  <h3>{item.title}</h3>
                  <p>{item.summary || item.body}</p>
                </div>
                <div className="portal-tag-row">
                  <span className="portal-tag">{item.category || "Learning"}</span>
                  {item.programs?.title ? <span className="portal-tag">{item.programs.title}</span> : null}
                </div>
                {item.external_url ? <a className="button button-secondary" href={item.external_url} target="_blank" rel="noreferrer">Read Article</a> : null}
              </article>
            ))}
          </div>
        );
      }}
    </PortalPage>
  );
}

function PaymentsPage() {
  const { user } = useAuth();
  const query = useStudentPayments(user?.id);
  return (
    <PortalPage slug="payments">
      {(content) => {
        if (query.loading) return <PortalLoading label="Loading payments" />;
        if (query.error) return <PortalError message={query.error} onRetry={query.refetch} />;
        const records = query.data || [];
        if (!records.length) return <PortalEmpty content={content} />;
        return (
          <div className="portal-list">
            {records.map((item) => {
              const reliable = hasReliablePaymentStatus(item);
              const amount = Number(item.amount_kobo || item.paid_amount_kobo || item.expected_amount_kobo || 0) / 100;
              return (
                <article className="portal-record-card" key={item.id}>
                  <div>
                    <p className="eyebrow">{item.reference}</p>
                    <h3>{item.product_name || item.product_type}</h3>
                    <p>{formatCurrency(amount)} {item.currency || "NGN"}</p>
                  </div>
                  <dl className="portal-mini-details">
                    <div><dt>Status</dt><dd>{item.status}</dd></div>
                    <div><dt>Date</dt><dd>{formatDateTime(item.paid_at || item.created_at)}</dd></div>
                    <div><dt>Method</dt><dd>{item.payment_channel || item.payment_method || item.provider || "Paystack"}</dd></div>
                  </dl>
                  {reliable ? <span className="portal-tag success">Reliable record</span> : <span className="portal-tag">Awaiting confirmation</span>}
                </article>
              );
            })}
          </div>
        );
      }}
    </PortalPage>
  );
}

function CertificatesPage() {
  const { user } = useAuth();
  const query = useStudentCertificates(user?.id);
  return (
    <PortalPage slug="certificates">
      {(content) => {
        if (query.loading) return <PortalLoading label="Loading certificates" />;
        if (query.error) return <PortalError message={query.error} onRetry={query.refetch} />;
        const records = query.data || [];
        if (!records.length) return <PortalEmpty content={content} />;
        return (
          <div className="portal-list">
            {records.map((item) => (
              <article className="portal-record-card" key={item.id}>
                <p className="eyebrow">{item.certificate_number || item.status}</p>
                <h3>{item.title}</h3>
                <p>Issued: {formatDate(item.issued_at)}</p>
                {item.file_path ? <a className="button button-secondary" href={item.file_path} target="_blank" rel="noreferrer">Open Certificate</a> : null}
              </article>
            ))}
          </div>
        );
      }}
    </PortalPage>
  );
}

function NotificationsPage() {
  const { user } = useAuth();
  const query = useStudentNotifications(user?.id);
  const [busy, setBusy] = useState(false);

  async function markOne(id) {
    setBusy(true);
    try {
      await markNotificationRead(user.id, id);
      query.refetch();
    } finally {
      setBusy(false);
    }
  }

  async function markAll() {
    setBusy(true);
    try {
      await markAllNotificationsRead(user.id);
      query.refetch();
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalPage slug="notifications" actions={<button className="button button-secondary" type="button" onClick={markAll} disabled={busy}>Mark all as read</button>}>
      {(content) => {
        if (query.loading) return <PortalLoading label="Loading notifications" />;
        if (query.error) return <PortalError message={query.error} onRetry={query.refetch} />;
        const records = query.data || [];
        if (!records.length) return <PortalEmpty content={content} />;
        return (
          <div className="portal-list">
            {records.map((item) => (
              <article className={`portal-record-card ${item.read_at ? "" : "unread"}`} key={item.id}>
                <div>
                  <p className="eyebrow">{item.notification_type || "Portal update"}</p>
                  <h3>{item.title}</h3>
                  <p>{item.message}</p>
                  <small>{formatDateTime(item.created_at)}</small>
                </div>
                {item.read_at ? <span className="portal-tag">Read</span> : <button className="button button-secondary" type="button" onClick={() => markOne(item.id)} disabled={busy}>Mark as read</button>}
              </article>
            ))}
          </div>
        );
      }}
    </PortalPage>
  );
}

function SupportPage() {
  const { user } = useAuth();
  const query = useStudentSupportTickets(user?.id);
  const [form, setForm] = useState({ subject: "", category: "general", message: "" });
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (form.subject.trim().length < 3 || form.message.trim().length < 10) {
      setStatus({ type: "warning", message: "Add a clear subject and message so support can respond properly." });
      return;
    }
    setLoading(true);
    setStatus({ type: "", message: "" });
    try {
      await createSupportTicket(user.id, form);
      setForm({ subject: "", category: "general", message: "" });
      setStatus({ type: "success", message: "Support ticket created." });
      query.refetch();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Support ticket could not be created." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <PortalPage slug="support">
      {(content) => (
        <div className="portal-two-column">
          <form className="form-card" onSubmit={submit}>
            <div>
              <p className="eyebrow">New request</p>
              <h3>Contact student support</h3>
              <p>You can also use {siteConfig.contact.email} or {siteConfig.contact.phone}.</p>
            </div>
            <label>
              <span>Subject</span>
              <input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} />
            </label>
            <label>
              <span>Category</span>
              <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                <option value="general">General support</option>
                <option value="payment">Payment</option>
                <option value="course">Course access</option>
                <option value="profile">Profile</option>
              </select>
            </label>
            <label>
              <span>Message</span>
              <textarea value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} />
            </label>
            {status.message ? <div className={`form-status ${status.type}`} role="status">{status.message}</div> : null}
            <button className="button button-primary" type="submit" disabled={loading}>{loading ? "Sending" : "Create Ticket"}</button>
          </form>
          <div>
            {query.loading ? <PortalLoading label="Loading support tickets" /> : null}
            {query.error ? <PortalError message={query.error} onRetry={query.refetch} /> : null}
            {!query.loading && !query.error && !(query.data || []).length ? <PortalEmpty content={content} /> : null}
            <div className="portal-list">
              {(query.data || []).map((item) => (
                <article className="portal-record-card" key={item.id}>
                  <p className="eyebrow">{item.status}</p>
                  <h3>{item.subject}</h3>
                  <p>{item.message}</p>
                  {item.response ? <p><strong>Response:</strong> {item.response}</p> : null}
                  <small>{formatDateTime(item.created_at)}</small>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </PortalPage>
  );
}

function SettingsPage() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const preferencesQuery = useStudentPreferences(user?.id);
  const programCatalogQuery = useProgramCatalog();
  const programPreferenceQuery = useStudentProgramPreference(user?.id);
  const enrolmentsQuery = useStudentEnrolments(user?.id);
  const [preferences, setPreferences] = useState({
    email_notifications: true,
    portal_reminders: true,
    session_security_warnings: true
  });
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [programmeSaving, setProgrammeSaving] = useState(false);
  const activeOfficialProgramme = (enrolmentsQuery.data || []).find((item) => item.status === "active");

  useEffect(() => {
    if (!preferencesQuery.data) return;
    setPreferences({
      email_notifications: preferencesQuery.data.email_notifications !== false,
      portal_reminders: preferencesQuery.data.portal_reminders !== false,
      session_security_warnings: preferencesQuery.data.session_security_warnings !== false
    });
  }, [preferencesQuery.data]);

  useEffect(() => {
    setSelectedProgramId(programPreferenceQuery.data?.program_id || "");
  }, [programPreferenceQuery.data]);

  async function sendPasswordReset() {
    setLoading(true);
    setStatus({ type: "", message: "" });
    try {
      const result = await requestPasswordReset(user.email);
      setStatus({ type: result.ok ? "success" : "warning", message: result.message });
    } finally {
      setLoading(false);
    }
  }

  async function savePreferences() {
    setLoading(true);
    setStatus({ type: "", message: "" });
    try {
      await updateStudentPreferences(user.id, preferences);
      preferencesQuery.refetch();
      setStatus({ type: "success", message: "Portal preferences saved." });
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Portal preferences could not be saved." });
    } finally {
      setLoading(false);
    }
  }

  async function saveProgrammePreferenceSetting() {
    if (!selectedProgramId) {
      setStatus({ type: "warning", message: "Select your programme before saving." });
      return;
    }
    setProgrammeSaving(true);
    setStatus({ type: "", message: "" });
    try {
      await saveStudentProgramPreference(user.id, { program_id: selectedProgramId });
      programPreferenceQuery.refetch();
      dispatchPortalDataRefresh();
      setStatus({ type: "success", message: "Programme preference saved." });
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Programme preference could not be saved." });
    } finally {
      setProgrammeSaving(false);
    }
  }

  return (
    <PortalPage slug="settings">
      {() => (
        <div className="portal-list">
          <article className="portal-record-card">
            <h3>Account email</h3>
            <p>{user?.email}</p>
            <span className="portal-tag success"><CheckCircle2 size={14} aria-hidden="true" /> Verified</span>
          </article>
          <article className="portal-record-card">
            <h3>Password recovery</h3>
            <p>Send a secure password reset link to your verified email address.</p>
            <button className="button button-secondary" type="button" onClick={sendPasswordReset} disabled={loading}>{loading ? "Sending" : "Send password reset link"}</button>
          </article>
          <article className="portal-record-card">
            <h3>Theme preference</h3>
            <p>Choose how the portal appears on this device.</p>
            <div className="segmented-control" role="group" aria-label="Theme preference">
              <button type="button" className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}><Sun size={16} aria-hidden="true" /> Light</button>
              <button type="button" className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}><Moon size={16} aria-hidden="true" /> Dark</button>
            </div>
          </article>
          <article className="portal-record-card">
            <h3>Programme preference</h3>
            <p>Select the programme used for timetable personalisation when no active enrolment is assigned.</p>
            {activeOfficialProgramme ? (
              <span className="portal-tag success"><CheckCircle2 size={14} aria-hidden="true" /> Official enrolment takes priority</span>
            ) : null}
            {programCatalogQuery.loading ? <PortalLoading label="Loading programmes" /> : null}
            {programCatalogQuery.error ? (
              <div className="form-status warning" role="alert">
                Programme list could not be loaded.
                <button className="text-link" type="button" onClick={programCatalogQuery.refetch}>Try again</button>
              </div>
            ) : null}
            {!programCatalogQuery.loading && !programCatalogQuery.error ? (
              <>
                <ProgrammeSelector
                  programs={programCatalogQuery.data || []}
                  value={selectedProgramId}
                  onChange={setSelectedProgramId}
                  disabled={programmeSaving}
                />
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={saveProgrammePreferenceSetting}
                  disabled={programmeSaving}
                >
                  {programmeSaving ? "Saving Programme" : "Save Programme"}
                </button>
              </>
            ) : null}
          </article>
          <article className="portal-record-card">
            <h3>Portal preferences</h3>
            <p>Choose the account notices and session security reminders you want enabled for this browser experience.</p>
            {preferencesQuery.loading ? <PortalLoading label="Loading preferences" /> : null}
            {preferencesQuery.error ? <PortalError message={preferencesQuery.error} onRetry={preferencesQuery.refetch} /> : null}
            {!preferencesQuery.loading && !preferencesQuery.error ? (
              <div className="portal-toggle-list">
                <label>
                  <input
                    type="checkbox"
                    checked={preferences.email_notifications}
                    onChange={(event) => setPreferences({ ...preferences, email_notifications: event.target.checked })}
                  />
                  <span>Email notifications</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={preferences.portal_reminders}
                    onChange={(event) => setPreferences({ ...preferences, portal_reminders: event.target.checked })}
                  />
                  <span>Portal reminders</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={preferences.session_security_warnings}
                    onChange={(event) => setPreferences({ ...preferences, session_security_warnings: event.target.checked })}
                  />
                  <span>Session security warnings</span>
                </label>
                <button className="button button-secondary" type="button" onClick={savePreferences} disabled={loading}>
                  {loading ? "Saving" : "Save Preferences"}
                </button>
              </div>
            ) : null}
          </article>
          {status.message ? <div className={`form-status ${status.type}`} role="status">{status.message}</div> : null}
          <button className="button button-primary" type="button" onClick={signOut}>Sign Out</button>
        </div>
      )}
    </PortalPage>
  );
}

export function PortalSection({ page }) {
  if (page === "my-courses") return <MyCoursesPage />;
  if (page === "classroom") return <StudentClassroomPage />;
  if (page === "timetable") return <TimetablePage />;
  if (page === "announcements") return <AnnouncementsPage />;
  if (page === "assignments") return <AssignmentsPage />;
  if (page === "resources") return <ResourcesPage />;
  if (page === "payments") return <PaymentsPage />;
  if (page === "certificates") return <CertificatesPage />;
  if (page === "notifications") return <NotificationsPage />;
  if (page === "articles") return <ArticlesPage />;
  if (page === "support") return <SupportPage />;
  if (page === "settings") return <SettingsPage />;
  return <MyCoursesPage />;
}

export function PortalProfile() {
  const { user, refreshProfile } = useAuth();
  const query = useStudentProfile(user);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", date_of_birth: "", education_level: "", address: "" });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const avatarObjectUrlRef = useRef("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const profile = query.data;
    if (!profile && !user) return;
    setForm({
      full_name: profile?.full_name || "",
      email: user?.email || profile?.email || "",
      phone: profile?.phone || "",
      date_of_birth: profile?.date_of_birth || "",
      education_level: profile?.education_level || "",
      address: profile?.address || ""
    });
    setAvatarPreview(profile?.avatar_url || "");
    if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current);
    avatarObjectUrlRef.current = "";
    setAvatarFile(null);
    setRemoveAvatar(false);
  }, [query.data, user]);

  useEffect(() => () => {
    if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current);
  }, []);

  const dirty = useMemo(() => {
    const profile = query.data || {};
    return Boolean(
      avatarFile ||
      removeAvatar ||
      form.full_name !== (profile.full_name || "") ||
      form.phone !== (profile.phone || "") ||
      form.date_of_birth !== (profile.date_of_birth || "") ||
      form.education_level !== (profile.education_level || "") ||
      form.address !== (profile.address || "")
    );
  }, [avatarFile, form, query.data, removeAvatar]);

  useEffect(() => {
    if (!dirty) return undefined;
    function handleBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  function selectAvatar(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setStatus({ type: "warning", message: "Upload a JPEG, PNG or WebP image for your profile picture." });
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setStatus({ type: "warning", message: "Profile picture must be 3 MB or smaller." });
      return;
    }
    setAvatarFile(file);
    setRemoveAvatar(false);
    if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current);
    avatarObjectUrlRef.current = URL.createObjectURL(file);
    setAvatarPreview(avatarObjectUrlRef.current);
    setStatus({ type: "", message: "" });
  }

  function clearAvatar() {
    setAvatarFile(null);
    setAvatarPreview("");
    setRemoveAvatar(Boolean(query.data?.avatar_path));
  }

  async function submit(event) {
    event.preventDefault();
    if (form.full_name.trim().length < 2 || !isValidEmail(form.email) || form.phone.trim().length < 7) {
      setStatus({ type: "warning", message: "Review your name, email and phone number before saving." });
      return;
    }
    setSaving(true);
    setStatus({ type: "", message: "" });
    try {
      await updateStudentProfile(user.id, {
        ...form,
        avatarFile,
        removeAvatar,
        avatar_path: query.data?.avatar_path || "",
        previous_avatar_path: query.data?.avatar_path || ""
      });
      await refreshProfile();
      query.refetch();
      setAvatarFile(null);
      setRemoveAvatar(false);
      setStatus({ type: "success", message: "Profile updated successfully." });
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Profile could not be updated." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <PortalPage slug="profile">
      {(content) => {
        if (query.loading) return <PortalLoading label="Loading profile" />;
        if (query.error) return <PortalError message={query.error} onRetry={query.refetch} />;
        if (!query.data) return <PortalEmpty content={content} />;
        return (
          <form className="form-card portal-profile-form" onSubmit={submit}>
            <div className="portal-profile-summary">
              <div className="portal-avatar-uploader">
                <PortalAvatar profile={{ ...query.data, avatar_url: avatarPreview }} user={user} size="xl" />
                <div>
                  <label className="button button-secondary">
                    <Upload size={16} aria-hidden="true" />
                    Change Photo
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectAvatar} />
                  </label>
                  {avatarPreview ? (
                    <button className="button button-secondary" type="button" onClick={clearAvatar}>
                      <Trash2 size={16} aria-hidden="true" />
                      Remove Photo
                    </button>
                  ) : null}
                  <small>JPEG, PNG or WebP, up to 3 MB.</small>
                </div>
              </div>
              <div className="portal-metric-card">
                <span>Profile completion</span>
                <strong>{calculateProfileCompletion({ ...form, avatar_path: removeAvatar ? "" : query.data.avatar_path || avatarPreview })}%</strong>
                <small>Keep your profile current so support can contact you accurately.</small>
              </div>
              <div className="portal-metric-card">
                <span>Email verification</span>
                <strong>{user?.email_confirmed_at || user?.confirmed_at ? "Verified" : "Pending"}</strong>
                <small>Account created {formatDateTime(user?.created_at || query.data.created_at)}</small>
              </div>
            </div>
            <div className="form-grid">
              <label>
                <span>Full name</span>
                <input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} />
              </label>
              <label>
                <span>Email address</span>
                <input value={form.email} readOnly />
              </label>
              <label>
                <span>Phone</span>
                <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              </label>
              <label>
                <span>Date of birth</span>
                <input type="date" value={form.date_of_birth || ""} onChange={(event) => setForm({ ...form, date_of_birth: event.target.value })} />
              </label>
              <label>
                <span>Level of education</span>
                <input value={form.education_level || ""} onChange={(event) => setForm({ ...form, education_level: event.target.value })} />
              </label>
              <label>
                <span>Residential address</span>
                <input value={form.address || ""} onChange={(event) => setForm({ ...form, address: event.target.value })} />
              </label>
            </div>
            {status.message ? <div className={`form-status ${status.type}`} role="status">{status.message}</div> : null}
            <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving" : "Save Profile"}</button>
          </form>
        );
      }}
    </PortalPage>
  );
}

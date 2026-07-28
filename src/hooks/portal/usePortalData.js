import { useCallback, useEffect, useState } from "react";
import { toSafeErrorMessage, withQueryTimeout } from "../../utils/errors";
import {
  getProgramCatalog,
  getPortalPageContent,
  getStudentClassroom,
  getStudentAnnouncements,
  getStudentAssignments,
  getStudentCertificates,
  getStudentDashboard,
  getStudentEnrolments,
  getStudentLiveClasses,
  getStudentNotifications,
  getStudentActivePayments,
  getPortalArticles,
  getStudentPreferences,
  getStudentProfile,
  getStudentResources,
  getStudentSupportTickets,
  getStudentTimetable
} from "../../services/portal/portalRepository";

function usePortalQuery(queryFn, deps, options = {}) {
  const depsKey = deps.map((item) => String(item ?? "")).join("|");
  const enabled = options.enabled !== false;
  const [state, setState] = useState({
    data: null,
    loading: enabled,
    error: ""
  });
  const [version, setVersion] = useState(0);

  const refetch = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let active = true;
    if (!enabled) {
      setState({ data: null, loading: false, error: "" });
      return () => {
        active = false;
      };
    }
    setState((current) => ({ ...current, loading: true, error: "" }));
    withQueryTimeout(Promise.resolve().then(queryFn), 15000, "This Portal information took too long to load.")
      .then((data) => {
        if (active) setState({ data, loading: false, error: "" });
      })
      .catch((error) => {
        if (import.meta.env.DEV) console.info("Portal query failed", error);
        if (active) setState({
          data: null,
          loading: false,
          error: toSafeErrorMessage(error, "We could not load this Portal information right now.")
        });
      });
    return () => {
      active = false;
    };
  // queryFn is intentionally recreated by page-specific hooks; depsKey is the stable query identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey, enabled, version]);

  useEffect(() => {
    const clear = () => setState({ data: null, loading: false, error: "" });
    window.addEventListener("zentel:portal-cache-clear", clear);
    return () => window.removeEventListener("zentel:portal-cache-clear", clear);
  }, []);

  useEffect(() => {
    const refresh = () => setVersion((current) => current + 1);
    window.addEventListener("zentel:portal-data-refresh", refresh);
    return () => window.removeEventListener("zentel:portal-data-refresh", refresh);
  }, []);

  return { ...state, refetch };
}

export function useProgramCatalog() {
  return usePortalQuery(() => getProgramCatalog(), []);
}

export function usePortalPageContent(pageSlug) {
  return usePortalQuery(() => getPortalPageContent(pageSlug), [pageSlug]);
}

export function useStudentDashboard(userId) {
  return usePortalQuery(() => getStudentDashboard(userId), [userId], { enabled: Boolean(userId) });
}

export function useStudentProfile(user) {
  return usePortalQuery(() => getStudentProfile(user), [user?.id], { enabled: Boolean(user?.id) });
}

export function useStudentEnrolments(userId) {
  return usePortalQuery(() => getStudentEnrolments(userId), [userId], { enabled: Boolean(userId) });
}

export function useStudentTimetable(userId) {
  return usePortalQuery(() => getStudentTimetable(userId), [userId], { enabled: Boolean(userId) });
}

export function useStudentLiveClasses(userId) {
  return usePortalQuery(() => getStudentLiveClasses(userId), [userId], { enabled: Boolean(userId) });
}

export function useStudentClassroom(userId) {
  return usePortalQuery(() => getStudentClassroom(userId), [userId], { enabled: Boolean(userId) });
}

export function useStudentAnnouncements(userId) {
  return usePortalQuery(() => getStudentAnnouncements(userId), [userId], { enabled: Boolean(userId) });
}

export function useStudentAssignments(userId) {
  return usePortalQuery(() => getStudentAssignments(userId), [userId], { enabled: Boolean(userId) });
}

export function useStudentResources(userId) {
  return usePortalQuery(() => getStudentResources(userId), [userId], { enabled: Boolean(userId) });
}

export function usePortalArticles(userId) {
  return usePortalQuery(() => getPortalArticles(userId), [userId], { enabled: Boolean(userId) });
}

export function useStudentActivePayments(userId) {
  return usePortalQuery(() => getStudentActivePayments(userId), [userId], { enabled: Boolean(userId) });
}

export function useStudentCertificates(userId) {
  return usePortalQuery(() => getStudentCertificates(userId), [userId], { enabled: Boolean(userId) });
}

export function useStudentNotifications(userId) {
  return usePortalQuery(() => getStudentNotifications(userId), [userId], { enabled: Boolean(userId) });
}

export function useStudentSupportTickets(userId) {
  return usePortalQuery(() => getStudentSupportTickets(userId), [userId], { enabled: Boolean(userId) });
}

export function useStudentPreferences(userId) {
  return usePortalQuery(() => getStudentPreferences(userId), [userId], { enabled: Boolean(userId) });
}

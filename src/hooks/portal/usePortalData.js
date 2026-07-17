import { useCallback, useEffect, useState } from "react";
import {
  getPortalPageContent,
  getStudentAnnouncements,
  getStudentAssignments,
  getStudentCertificates,
  getStudentDashboard,
  getStudentEnrolments,
  getStudentNotifications,
  getStudentPayments,
  getStudentProfile,
  getStudentResources,
  getStudentSupportTickets,
  getStudentTimetable
} from "../../services/portal/portalRepository";

function usePortalQuery(queryFn, deps) {
  const depsKey = deps.map((item) => String(item ?? "")).join("|");
  const [state, setState] = useState({
    data: null,
    loading: true,
    error: ""
  });
  const [version, setVersion] = useState(0);

  const refetch = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: "" }));
    queryFn()
      .then((data) => {
        if (active) setState({ data, loading: false, error: "" });
      })
      .catch((error) => {
        if (import.meta.env.DEV) console.info("Portal query failed", error);
        if (active) setState({ data: null, loading: false, error: error.message || "We could not load this information" });
      });
    return () => {
      active = false;
    };
  // queryFn is intentionally recreated by page-specific hooks; depsKey is the stable query identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey, version]);

  useEffect(() => {
    const clear = () => setState({ data: null, loading: false, error: "" });
    window.addEventListener("zentel:portal-cache-clear", clear);
    return () => window.removeEventListener("zentel:portal-cache-clear", clear);
  }, []);

  return { ...state, refetch };
}

export function usePortalPageContent(pageSlug) {
  return usePortalQuery(() => getPortalPageContent(pageSlug), [pageSlug]);
}

export function useStudentDashboard(userId) {
  return usePortalQuery(() => getStudentDashboard(userId), [userId]);
}

export function useStudentProfile(user) {
  return usePortalQuery(() => getStudentProfile(user), [user?.id]);
}

export function useStudentEnrolments(userId) {
  return usePortalQuery(() => getStudentEnrolments(userId), [userId]);
}

export function useStudentTimetable(userId) {
  return usePortalQuery(() => getStudentTimetable(userId), [userId]);
}

export function useStudentAnnouncements(userId) {
  return usePortalQuery(() => getStudentAnnouncements(userId), [userId]);
}

export function useStudentAssignments(userId) {
  return usePortalQuery(() => getStudentAssignments(userId), [userId]);
}

export function useStudentResources(userId) {
  return usePortalQuery(() => getStudentResources(userId), [userId]);
}

export function useStudentPayments(userId) {
  return usePortalQuery(() => getStudentPayments(userId), [userId]);
}

export function useStudentCertificates(userId) {
  return usePortalQuery(() => getStudentCertificates(userId), [userId]);
}

export function useStudentNotifications(userId) {
  return usePortalQuery(() => getStudentNotifications(userId), [userId]);
}

export function useStudentSupportTickets(userId) {
  return usePortalQuery(() => getStudentSupportTickets(userId), [userId]);
}

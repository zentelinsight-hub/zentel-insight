import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./authContextCore";
import { getSupabaseClient, getSupabaseSafeStatus, hasSupabaseConfig } from "../services/supabaseClient";
import { attachProfileAvatarUrl, calculateProfileCompletion } from "../services/portal/portalRepository";
import {
  ACCOUNT_STATUSES,
  clearCurrentAdminVerification,
  getAdminVerificationStatus,
  getCurrentUserAccountStatus,
  getCurrentUserRole,
  normalizeAccountStatus,
  USER_ROLES
} from "../services/roleService";
import { clearStoredSessionSecurity } from "../services/sessionSecurity";

function withTimeout(promise, message, timeoutMs = 15000) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

async function repairMissingProfile(supabase, currentUser) {
  const metadata = currentUser.user_metadata || {};
  const profilePayload = {
    id: currentUser.id,
    full_name: metadata.full_name || "",
    date_of_birth: metadata.date_of_birth || null,
    education_level: metadata.education_level || "",
    phone: metadata.phone || "",
    address: metadata.address || "",
    email: currentUser.email || "",
    account_status: ACCOUNT_STATUSES.INACTIVE,
    status_changed_at: new Date().toISOString(),
    status_reason: "Repaired profile pending Admin activation",
    profile_completed: Boolean(metadata.full_name),
    profile_completion: calculateProfileCompletion({
      full_name: metadata.full_name || "",
      phone: metadata.phone || "",
      date_of_birth: metadata.date_of_birth || "",
      education_level: metadata.education_level || "",
      address: metadata.address || "",
      avatar_path: ""
    })
  };

  const { data, error } = await withTimeout(
    supabase.from("profiles").upsert(profilePayload, { onConflict: "id" }).select("*").maybeSingle(),
    "Profile repair timed out."
  );
  if (error) return null;
  return data || null;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [role, setRole] = useState(USER_ROLES.STUDENT);
  const [roleLoading, setRoleLoading] = useState(false);
  const [roleError, setRoleError] = useState("");
  const [accountStatus, setAccountStatus] = useState(ACCOUNT_STATUSES.INACTIVE);
  const [accountStatusLoading, setAccountStatusLoading] = useState(false);
  const [accountStatusError, setAccountStatusError] = useState("");
  const [adminVerified, setAdminVerified] = useState(false);
  const [adminVerificationLoading, setAdminVerificationLoading] = useState(false);
  const configured = hasSupabaseConfig();

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const status = getSupabaseSafeStatus();
    if (!status.ready) {
      console.info("Supabase Auth development diagnostic", {
        urlConfigured: status.urlConfigured,
        publishableKeyConfigured: status.publishableKeyConfigured,
        urlUsesHttps: status.urlUsesHttps,
        urlMatchesExpected: status.urlMatchesExpected,
        legacyAnonKeyPresent: status.legacyAnonKeyPresent,
        issues: status.issues
      });
    }
  }, []);

  const refreshProfile = useCallback(async (currentUser) => {
    if (!currentUser) {
      setProfile(null);
      setProfileError("");
      setAccountStatus(ACCOUNT_STATUSES.INACTIVE);
      setAccountStatusError("");
      return null;
    }
    const supabase = await getSupabaseClient();
    if (!supabase) return null;
    setProfileLoading(true);
    setProfileError("");
    setAccountStatusLoading(true);
    setAccountStatusError("");
    try {
      const { data, error } = await withTimeout(
        supabase.from("profiles").select("*").eq("id", currentUser.id).maybeSingle(),
        "Profile loading timed out."
      );
      if (error) throw error;
      let profileData = data || null;
      if (!profileData) {
        profileData = await repairMissingProfile(supabase, currentUser);
      }
      const profileWithAvatar = profileData ? await attachProfileAvatarUrl(profileData) : null;
      setProfile(profileWithAvatar || null);
      setAccountStatus(normalizeAccountStatus(profileWithAvatar?.account_status));
      return profileWithAvatar || null;
    } catch (error) {
      setProfile(null);
      setProfileError(error.message || "Profile information could not be loaded.");
      setAccountStatus(ACCOUNT_STATUSES.INACTIVE);
      setAccountStatusError(error.message || "Account status could not be loaded.");
      return null;
    } finally {
      setProfileLoading(false);
      setAccountStatusLoading(false);
    }
  }, []);

  const refreshAccountStatus = useCallback(async (currentUser) => {
    if (!currentUser?.id) {
      setAccountStatus(ACCOUNT_STATUSES.INACTIVE);
      setAccountStatusError("");
      return ACCOUNT_STATUSES.INACTIVE;
    }
    setAccountStatusLoading(true);
    setAccountStatusError("");
    try {
      const nextStatus = await getCurrentUserAccountStatus(currentUser.id);
      setAccountStatus(nextStatus);
      return nextStatus;
    } catch (error) {
      setAccountStatus(ACCOUNT_STATUSES.INACTIVE);
      setAccountStatusError(error.message || "Account status could not be loaded.");
      return ACCOUNT_STATUSES.INACTIVE;
    } finally {
      setAccountStatusLoading(false);
    }
  }, []);

  const refreshRole = useCallback(async (currentUser) => {
    if (!currentUser?.id) {
      setRole(USER_ROLES.STUDENT);
      setRoleError("");
      return USER_ROLES.STUDENT;
    }
    setRoleLoading(true);
    setRoleError("");
    try {
      const nextRole = await getCurrentUserRole(currentUser.id);
      setRole(nextRole);
      return nextRole;
    } catch (error) {
      setRole(USER_ROLES.STUDENT);
      setRoleError(error.message || "Account role could not be loaded.");
      return USER_ROLES.STUDENT;
    } finally {
      setRoleLoading(false);
    }
  }, []);

  const refreshAdminVerification = useCallback(async (currentUser) => {
    if (!currentUser?.id) {
      setAdminVerified(false);
      return false;
    }
    setAdminVerificationLoading(true);
    try {
      const verified = await getAdminVerificationStatus(currentUser.id);
      setAdminVerified(verified);
      return verified;
    } catch {
      setAdminVerified(false);
      return false;
    } finally {
      setAdminVerificationLoading(false);
    }
  }, []);

  const signOut = useCallback(async (options = {}) => {
    const supabase = await getSupabaseClient();
    await clearCurrentAdminVerification().catch(() => false);
    window.dispatchEvent(new CustomEvent("zentel:portal-cache-clear"));
    window.dispatchEvent(new CustomEvent("zentel:admin-verification-clear"));
    clearStoredSessionSecurity();
    setProfile(null);
    setSession(null);
    setUser(null);
    setRole(USER_ROLES.STUDENT);
    setAccountStatus(ACCOUNT_STATUSES.INACTIVE);
    setAdminVerified(false);
    await supabase?.auth.signOut({ scope: options.scope || "global" });
  }, []);

  useEffect(() => {
    let active = true;
    let subscription;

    async function loadSession() {
      setAuthLoading(true);
      setAuthReady(false);
      setAuthError("");

      try {
        if (!configured) {
          return;
        }

        const supabase = await getSupabaseClient();
        const { data, error } = await withTimeout(supabase.auth.getSession(), "Account session check timed out.");
        if (error) throw error;
        if (!active) return;

        setSession(data.session || null);
        setUser(data.session?.user || null);
        if (data.session?.user) {
          await Promise.all([
            refreshProfile(data.session.user),
            refreshAccountStatus(data.session.user),
            refreshRole(data.session.user),
            refreshAdminVerification(data.session.user)
          ]);
        }

        const listener = supabase.auth.onAuthStateChange((_event, nextSession) => {
          if (!active) return;
          setSession(nextSession || null);
          setUser(nextSession?.user || null);
          if (nextSession?.user) {
            void refreshProfile(nextSession.user);
            void refreshAccountStatus(nextSession.user);
            void refreshRole(nextSession.user).then((nextRole) => {
              if (nextRole === USER_ROLES.ADMIN) void refreshAdminVerification(nextSession.user);
              else setAdminVerified(false);
            });
          } else {
            setProfile(null);
            setProfileError("");
            setRole(USER_ROLES.STUDENT);
            setRoleError("");
            setAccountStatus(ACCOUNT_STATUSES.INACTIVE);
            setAccountStatusError("");
            setAdminVerified(false);
          }
        });
        subscription = listener.data.subscription;
      } catch (error) {
        if (active) {
          setSession(null);
          setUser(null);
          setProfile(null);
          setRole(USER_ROLES.STUDENT);
          setAccountStatus(ACCOUNT_STATUSES.INACTIVE);
          setAdminVerified(false);
          setAuthError(error.message || "Account access could not be checked.");
        }
      } finally {
        if (active) {
          setAuthReady(true);
          setAuthLoading(false);
        }
      }
    }

    void loadSession();
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [configured, refreshAccountStatus, refreshAdminVerification, refreshProfile, refreshRole]);

  useEffect(() => {
    if (!configured || !user?.id) return undefined;
    let active = true;
    let supabaseRef;
    let channel;

    getSupabaseClient().then((supabase) => {
      if (!active || !supabase) return;
      supabaseRef = supabase;
      channel = supabase
        .channel(`profile-status:${user.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
          (payload) => {
            const nextProfile = payload.new || {};
            const nextStatus = normalizeAccountStatus(nextProfile.account_status);
            setProfile((current) => current ? { ...current, ...nextProfile, avatar_url: current.avatar_url } : nextProfile);
            setAccountStatus(nextStatus);
            window.dispatchEvent(new CustomEvent("zentel:account-status-changed", { detail: { accountStatus: nextStatus } }));
            if (nextStatus !== ACCOUNT_STATUSES.ACTIVE) {
              window.dispatchEvent(new CustomEvent("zentel:portal-cache-clear"));
            } else {
              window.dispatchEvent(new CustomEvent("zentel:portal-data-refresh"));
            }
          }
        )
        .subscribe();
    });

    return () => {
      active = false;
      if (supabaseRef && channel) {
        void supabaseRef.removeChannel(channel);
      }
    };
  }, [configured, user?.id]);

  const value = useMemo(
    () => ({
      configured,
      authReady,
      authLoading,
      authError,
      profileLoading,
      profileError,
      loading: authLoading,
      session,
      user,
      profile,
      role,
      roleLoading,
      roleError,
      accountStatus,
      accountStatusLoading,
      accountStatusError,
      accountActive: accountStatus === ACCOUNT_STATUSES.ACTIVE,
      adminVerified,
      adminVerificationLoading,
      refreshProfile: () => refreshProfile(user),
      refreshAccountStatus: () => refreshAccountStatus(user),
      refreshRole: () => refreshRole(user),
      refreshAdminVerification: () => refreshAdminVerification(user),
      signOut
    }),
    [
      accountStatus,
      accountStatusError,
      accountStatusLoading,
      adminVerificationLoading,
      adminVerified,
      authError,
      authLoading,
      authReady,
      configured,
      profile,
      profileError,
      profileLoading,
      refreshAccountStatus,
      refreshAdminVerification,
      refreshProfile,
      refreshRole,
      role,
      roleError,
      roleLoading,
      session,
      signOut,
      user
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

import { getSupabaseClient } from "./supabaseClient";

const authTimeoutMs = 15000;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function withTimeout(promise, message, timeoutMs = authTimeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function getSafeAuthError(error, fallback) {
  if (!error) return fallback;
  const message = error.message || "";
  if (/failed to fetch|networkerror|load failed|fetch/i.test(message) && !/invalid/i.test(message)) {
    return "We could not connect to the authentication service. Check your internet connection and try again.";
  }
  if (/timed out|abort/i.test(message)) {
    return message;
  }
  if (/invalid login credentials|invalid credentials/i.test(message)) {
    return "The email or password is incorrect.";
  }
  if (/email not confirmed|not confirmed|not verified|confirm your email/i.test(message)) {
    return "Verify your email before signing in.";
  }
  if (/rate|too many/i.test(error.message)) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (/already|registered|exists/i.test(error.message)) {
    return "If this email is already registered, use Login or Forgot Password to continue.";
  }
  return message || fallback;
}

export async function loginWithEmail({ email, password }) {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    return {
      ok: false,
      unavailable: true,
      message: "Account access is temporarily unavailable. Please try again later."
    };
  }

  let data;
  let error;
  try {
    ({ data, error } = await withTimeout(
      supabase.auth.signInWithPassword({ email: normalizeEmail(email), password }),
      "Login timed out. Check your connection and try again."
    ));
  } catch (requestError) {
    return { ok: false, message: getSafeAuthError(requestError, "Login failed.") };
  }
  if (error) {
    return { ok: false, message: getSafeAuthError(error, "Login failed.") };
  }

  if (!data?.session || !data?.user) {
    return { ok: false, message: "Login did not return a valid session. Please try again." };
  }

  if (!data.user.email_confirmed_at && !data.user.confirmed_at) {
    await supabase.auth.signOut();
    return { ok: false, message: "Please verify your email before logging in." };
  }

  await claimMyEnrolments();
  return { ok: true, session: data.session, user: data.user, message: "You are now logged in." };
}

export async function signupWithEmail({ email, password, fullName, dateOfBirth, phone, address }) {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    return {
      ok: false,
      unavailable: true,
      message: "Account registration is temporarily unavailable. Please try again later."
    };
  }

  let data;
  let error;
  try {
    ({ data, error } = await withTimeout(
      supabase.auth.signUp({
        email: normalizeEmail(email),
        password,
        options: {
          data: {
            full_name: fullName,
            date_of_birth: dateOfBirth,
            phone,
            address
          }
        }
      }),
      "Signup timed out. Check your connection and try again."
    ));
  } catch (requestError) {
    return { ok: false, message: getSafeAuthError(requestError, "Signup failed.") };
  }
  if (error) {
    return { ok: false, message: getSafeAuthError(error, "Signup failed.") };
  }
  if (!data?.user) {
    return { ok: false, message: "Signup did not return an account record. Please try again." };
  }

  return {
    ok: true,
    user: data?.user || null,
    message: "Account request submitted. Check your email if confirmation is required."
  };
}

export async function verifyEmailOtp({ email, token }) {
  const supabase = await getSupabaseClient();
  if (!supabase) return { ok: false, message: "Email verification is temporarily unavailable. Please try again later." };
  let data;
  let error;
  try {
    ({ data, error } = await withTimeout(
      supabase.auth.verifyOtp({ email: normalizeEmail(email), token, type: "email" }),
      "Email verification timed out. Check your connection and try again."
    ));
  } catch (requestError) {
    return { ok: false, message: getSafeAuthError(requestError, "Email verification failed.") };
  }
  if (error) return { ok: false, message: getSafeAuthError(error, "Email verification failed.") };
  await claimMyEnrolments();
  return { ok: true, session: data?.session || null, user: data?.user || null, message: "Email verified successfully." };
}

export async function resendSignupOtp(email) {
  const supabase = await getSupabaseClient();
  if (!supabase) return { ok: false, message: "Email verification is temporarily unavailable. Please try again later." };
  const { error } = await withTimeout(
    supabase.auth.resend({ type: "signup", email: normalizeEmail(email) }),
    "Verification email request timed out. Please try again."
  );
  if (error) return { ok: false, message: getSafeAuthError(error, "A new verification code could not be requested.") };
  return { ok: true, message: "A new verification code has been requested." };
}

export async function requestPasswordReset(email) {
  const supabase = await getSupabaseClient();
  if (!supabase) return { ok: false, message: "Password recovery is temporarily unavailable. Please try again later." };
  const redirectTo = `${window.location.origin}/reset-password`;
  const { error } = await withTimeout(
    supabase.auth.resetPasswordForEmail(normalizeEmail(email), { redirectTo }),
    "Password reset request timed out. Please try again."
  );
  if (error) return { ok: false, message: "If that email can receive reset instructions, they will be sent shortly." };
  return { ok: true, message: "If that email can receive reset instructions, they will be sent shortly." };
}

export async function updatePassword(password) {
  const supabase = await getSupabaseClient();
  if (!supabase) return { ok: false, message: "Password reset is temporarily unavailable. Please try again later." };
  const { error } = await withTimeout(
    supabase.auth.updateUser({ password }),
    "Password update timed out. Please try again."
  );
  if (error) return { ok: false, message: getSafeAuthError(error, "Password could not be updated.") };
  return { ok: true, message: "Password updated successfully." };
}

export async function claimMyEnrolments() {
  const supabase = await getSupabaseClient();
  if (!supabase) return { ok: false, linked: 0, message: "Account access is temporarily unavailable." };

  let data;
  let error;
  try {
    ({ data, error } = await withTimeout(
      supabase.functions.invoke("claim-my-enrolments", { body: {} }),
      "Claiming paid enrolments timed out."
    ));
  } catch (requestError) {
    return { ok: false, linked: 0, message: requestError.message || "Paid enrolments could not be refreshed." };
  }

  if (error) {
    return { ok: false, linked: 0, message: error.message || "Paid enrolments could not be refreshed." };
  }

  return {
    ok: true,
    linked: Number(data?.linked || 0),
    message: data?.message || "Paid enrolments refreshed."
  };
}

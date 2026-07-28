const technicalErrorPattern = /failed to fetch|functions(?:http|fetch|relay)error|row.level|rls|relation .* does not exist|foreign key|jwt|networkerror|load failed|aborterror|invalid input syntax|permission denied|policy|postgrest|pgrst|supabase/i;

function makeSupportReference() {
  const value = Math.floor(1000 + Math.random() * 9000);
  return `ZI-${value}`;
}

export function toSafeErrorMessage(error, fallback = "We could not load this information right now.") {
  const message = String(error?.message || error || "").trim();
  if (message && !technicalErrorPattern.test(message)) return message;
  return `${fallback} Please try again. If the problem continues, contact support with reference ${makeSupportReference()}.`;
}

export function withQueryTimeout(promise, timeoutMs = 15000, message = "This request took too long to complete.") {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

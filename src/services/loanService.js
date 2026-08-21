import { invokeEdgeFunction } from "./edgeFunctionClient";
import { getSupabaseClient } from "./supabaseClient";

export const LOAN_KYC_BUCKET = "loan-kyc";
export const LOAN_KYC_MAX_BYTES = 5 * 1024 * 1024;
const acceptedKycTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function assertKycFile(file, label) {
  if (!file) throw new Error(`${label} is required.`);
  if (!acceptedKycTypes.has(file.type)) throw new Error(`${label} must be a JPEG, PNG, WebP or PDF file.`);
  if (file.size > LOAN_KYC_MAX_BYTES) throw new Error(`${label} must be 5 MB or smaller.`);
}

function extensionFor(file) {
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function assertOwnedKycPath(path, userId, applicationId, label) {
  if (!path || !String(path).startsWith(`${userId}/${applicationId}/`)) {
    throw new Error(`${label} must finish uploading before submission.`);
  }
}

async function clientAndUser() {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error("The secure loan service is unavailable.");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw new Error("Your session has expired. Please sign in again.");
  return { supabase, user: data.user };
}

export async function getMyLoanSnapshot() {
  const { supabase, user } = await clientAndUser();
  const [applications, repayments] = await Promise.all([
    supabase.from("loan_applications").select("*").eq("student_user_id", user.id).order("submitted_at", { ascending: false }),
    supabase.from("loan_repayments").select("*").eq("student_user_id", user.id).order("created_at", { ascending: false })
  ]);
  if (applications.error) throw applications.error;
  if (repayments.error) throw repayments.error;
  return { applications: applications.data || [], repayments: repayments.data || [] };
}

export async function uploadLoanKycFile({ applicationId, kind, file, previousPath = "" }) {
  const label = kind === "passport" ? "Passport photo" : "Identification file";
  if (!applicationId) throw new Error("The loan upload session is unavailable. Please try again.");
  if (!['passport', 'identification'].includes(kind)) throw new Error("Select a valid KYC document type.");
  assertKycFile(file, label);
  const { supabase, user } = await clientAndUser();
  if (previousPath && previousPath.startsWith(`${user.id}/${applicationId}/`)) {
    const { error: removeError } = await supabase.storage.from(LOAN_KYC_BUCKET).remove([previousPath]);
    if (removeError) throw removeError;
  }
  const path = `${user.id}/${applicationId}/${kind}-${crypto.randomUUID()}.${extensionFor(file)}`;
  const { error } = await supabase.storage.from(LOAN_KYC_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false
  });
  if (error) throw error;
  return { path, name: file.name, type: file.type, size: file.size };
}

export async function submitLoanApplication(values) {
  const { supabase, user } = await clientAndUser();
  const applicationId = values.applicationId;
  assertOwnedKycPath(values.passportPhotoPath, user.id, applicationId, "Passport photo");
  assertOwnedKycPath(values.identificationPath, user.id, applicationId, "Identification file");
  const { data, error } = await supabase.rpc("student_submit_loan_application", {
    application_id: applicationId,
    applicant_full_name: values.fullName,
    applicant_email: values.email,
    applicant_phone: values.phone,
    applicant_date_of_birth: values.dateOfBirth,
    applicant_nin: values.nin,
    applicant_bvn: values.bvn,
    applicant_identification_type: values.identificationType,
    passport_photo_path: values.passportPhotoPath,
    identification_path: values.identificationPath,
    requested_amount: Number(values.requestedAmount),
    loan_purpose: values.purpose,
    supporting_information: values.supportingInformation || ""
  });
  if (error) throw error;
  return data;
}

export async function saveLoanBankDetails(values) {
  const { supabase } = await clientAndUser();
  const { data, error } = await supabase.rpc("student_save_loan_bank_details", {
    application_id: values.applicationId,
    bank_name: values.bankName,
    account_name: values.accountName,
    account_number: values.accountNumber
  });
  if (error) throw error;
  return data;
}

export async function submitLoanRepayment(values) {
  const { supabase } = await clientAndUser();
  const { data, error } = await supabase.rpc("student_submit_loan_repayment", {
    application_id: values.applicationId,
    repayment_amount: Number(values.amount),
    repayment_reference: values.reference,
    repayment_note: values.note || ""
  });
  if (error) throw error;
  return data;
}

export async function getAdminLoanSnapshot() {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error("The secure loan service is unavailable.");
  const [applications, repayments] = await Promise.all([
    supabase.from("loan_applications").select("*").order("submitted_at", { ascending: false }),
    supabase.from("loan_repayments").select("*").order("created_at", { ascending: false })
  ]);
  if (applications.error) throw applications.error;
  if (repayments.error) throw repayments.error;
  return { applications: applications.data || [], repayments: repayments.data || [] };
}

export function reviewLoanApplication(applicationId) {
  return invokeEdgeFunction("admin-loan-action", {
    body: { action: "review", applicationId },
    timeoutMs: 30000,
    failureMessage: "Loan KYC could not be opened securely."
  });
}

export function manageLoanApplication(action, values) {
  return invokeEdgeFunction("admin-loan-action", {
    body: { action, ...values },
    timeoutMs: 30000,
    failureMessage: "The loan action could not be completed."
  });
}

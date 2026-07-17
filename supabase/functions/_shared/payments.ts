export const STUDYHUB_PRICES_KOBO = {
  JSS: 1500000,
  SSS: 2000000,
  SUMMER_LESSONS: 3000000
} as const;

export const STUDYHUB_SUMMER_LESSONS_KOBO = STUDYHUB_PRICES_KOBO.SUMMER_LESSONS;

export function createReference(prefix = "ZI") {
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
  return `${prefix}-${Date.now()}-${random}`;
}

export function calculateStudyHubAmountKobo(classGroup: string, subjectCount: number, months: number) {
  if (classGroup !== "JSS" && classGroup !== "SSS") {
    throw new Error("Select a valid StudyHub class group.");
  }
  if (!Number.isInteger(subjectCount) || subjectCount < 1) {
    throw new Error("Select at least one subject.");
  }
  if (!Number.isInteger(months) || months < 1) {
    throw new Error("Select at least one month.");
  }
  if (months > 12) {
    throw new Error("Select 12 months or fewer.");
  }
  return STUDYHUB_PRICES_KOBO[classGroup] * subjectCount * months;
}

export function isSafeEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

export async function verifyPaystackReference(reference: string) {
  const secretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!secretKey) {
    throw new Error("Paystack secret key is unavailable.");
  }

  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`
    }
  });

  if (!response.ok) {
    throw new Error("Paystack verification request failed.");
  }

  return response.json();
}

export async function hmacSha512Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function fulfilSuccessfulPayment(supabase: any, payment: any, paystackData: any, source: string) {
  if (payment.status === "success") {
    return payment;
  }

  const paidAmount = paystackData.amount;
  const currency = paystackData.currency || "NGN";
  const email = String(paystackData.customer?.email || "").trim().toLowerCase();

  if (
    paidAmount !== payment.expected_amount_kobo ||
    currency !== payment.currency ||
    email !== String(payment.customer_email || "").trim().toLowerCase()
  ) {
    throw new Error("Payment verification mismatch.");
  }

  const { data: updatedPayment, error: updateError } = await supabase
    .from("payments")
    .update({
      status: "success",
      paid_amount_kobo: paidAmount,
      paystack_transaction_id: String(paystackData.id || ""),
      payment_channel: paystackData.channel || null,
      gateway_response: paystackData.gateway_response || null,
      verification_source: source,
      paid_at: paystackData.paid_at || new Date().toISOString()
    })
    .eq("id", payment.id)
    .select()
    .single();

  if (updateError) throw updateError;

  if ((payment.brand === "zentel" || payment.brand === "zentel_insight") && payment.product_id) {
    const { data: level } = await supabase
      .from("program_levels")
      .select("id, program_id")
      .eq("id", payment.product_id)
      .maybeSingle();

    if (level) {
      await supabase.from("enrolments").upsert(
        {
          user_id: payment.user_id || null,
          program_id: level.program_id,
          program_level_id: level.id,
          payment_id: payment.id,
          status: payment.user_id ? "active" : "paid_unlinked",
          enrolled_date: new Date().toISOString().slice(0, 10)
        },
        { onConflict: "payment_id" }
      );
    }
  }

  if (payment.brand === "studyhub") {
    await supabase
      .from("studyhub_registrations")
      .update({ status: "active" })
      .eq("payment_id", payment.id);
  }

  return updatedPayment;
}

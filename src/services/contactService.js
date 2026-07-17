export async function submitContactForm(payload) {
  const endpoint = import.meta.env.VITE_CONTACT_FORM_ENDPOINT;

  if (!endpoint) {
    return {
      ok: false,
      unavailable: true,
      message: "Direct online submission is temporarily unavailable. Please use the available contact details."
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("The message could not be submitted. Please try again or use another contact option.");
  }

  return {
    ok: true,
    message: "Your message was submitted successfully."
  };
}

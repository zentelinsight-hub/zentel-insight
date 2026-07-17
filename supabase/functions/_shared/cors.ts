const allowedOrigins = new Set([
  "https://zentelinsight.com.ng",
  "https://www.zentelinsight.com.ng",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5180"
]);

export function getCorsHeaders(request?: Request) {
  const origin = request?.headers.get("origin") || "";
  const allowedOrigin = allowedOrigins.has(origin) ? origin : "https://zentelinsight.com.ng";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Vary": "Origin"
  };
}

export const corsHeaders = getCorsHeaders();

export function isAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || allowedOrigins.has(origin);
}

export function handleOptions(request: Request) {
  return new Response("ok", { headers: getCorsHeaders(request) });
}

export function jsonResponse(body: unknown, status = 200, request?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(request),
      "Content-Type": "application/json"
    }
  });
}

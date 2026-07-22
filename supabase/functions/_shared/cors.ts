const allowedOrigins = new Set([
  "https://zentelinsight.com.ng",
  "https://www.zentelinsight.com.ng",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5180",
  "http://localhost:5181",
  "http://localhost:5182",
  "http://localhost:5183",
  "http://localhost:5184",
  "http://localhost:5185",
  "http://localhost:5186",
  "http://localhost:5187",
  "http://localhost:5188",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5180",
  "http://127.0.0.1:5181",
  "http://127.0.0.1:5182",
  "http://127.0.0.1:5183",
  "http://127.0.0.1:5184",
  "http://127.0.0.1:5185",
  "http://127.0.0.1:5186",
  "http://127.0.0.1:5187",
  "http://127.0.0.1:5188"
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

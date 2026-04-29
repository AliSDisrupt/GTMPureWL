import { NextRequest, NextResponse } from "next/server";

const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";

function resolveGoogleRedirectUri(request: NextRequest): string {
  const configured = String(process.env.GOOGLE_OAUTH_REDIRECT_URI ?? "").trim();
  if (configured) {
    if (configured.endsWith(GOOGLE_CALLBACK_PATH)) {
      return configured;
    }
    return `${configured.replace(/\/+$/, "")}${GOOGLE_CALLBACK_PATH}`;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}${GOOGLE_CALLBACK_PATH}`;
  }

  return `${request.nextUrl.origin}${GOOGLE_CALLBACK_PATH}`;
}

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL("/login?error=google_not_configured", request.url));
  }
  const redirectUri = resolveGoogleRedirectUri(request);
  const state = crypto.randomUUID();
  const authUrl = new URL(GOOGLE_AUTH_BASE);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("purewl_google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 10
  });
  return response;
}

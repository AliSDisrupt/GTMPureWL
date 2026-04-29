import { NextRequest, NextResponse } from "next/server";
import { appendLoginAudit, getClientIp } from "../../../../../lib/loginAudit";

const ALLOWED_DOMAINS = new Set(["purevpn.com", "purewl.com", "disrupt.com"]);
const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";

type GoogleTokenResponse = {
  access_token?: string;
};

type GoogleUserInfoResponse = {
  email?: string;
  name?: string;
  picture?: string;
};

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
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/login?error=google_not_configured", request.url));
  }

  const state = request.nextUrl.searchParams.get("state") ?? "";
  const code = request.nextUrl.searchParams.get("code") ?? "";
  const cookieState = request.cookies.get("purewl_google_oauth_state")?.value ?? "";
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(new URL("/login?error=google_state", request.url));
  }

  const redirectUri = resolveGoogleRedirectUri(request);

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri
    })
  });
  if (!tokenResponse.ok) {
    return NextResponse.redirect(new URL("/login?error=google_token", request.url));
  }
  const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    return NextResponse.redirect(new URL("/login?error=google_token", request.url));
  }

  const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!userResponse.ok) {
    return NextResponse.redirect(new URL("/login?error=google_userinfo", request.url));
  }
  const userData = (await userResponse.json()) as GoogleUserInfoResponse;
  const email = String(userData.email ?? "").trim().toLowerCase();
  const name = String(userData.name ?? "").trim() || email.split("@")[0];
  const picture = String(userData.picture ?? "").trim();
  const domain = email.split("@")[1] ?? "";
  if (!email || !ALLOWED_DOMAINS.has(domain)) {
    return NextResponse.redirect(new URL("/login?error=domain_not_allowed", request.url));
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set("purewl_auth", email, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
  response.cookies.set("purewl_auth_name", name, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
  response.cookies.set("purewl_auth_email", email, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
  response.cookies.set("purewl_auth_picture", picture, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
  response.cookies.set("purewl_google_oauth_state", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 0
  });

  await appendLoginAudit({
    name,
    email,
    ip: getClientIp(request),
    logged_in_at: new Date().toISOString()
  });

  return response;
}

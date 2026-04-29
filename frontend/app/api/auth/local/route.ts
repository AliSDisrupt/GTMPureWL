import { NextRequest, NextResponse } from "next/server";
import { appendLoginAudit, getClientIp } from "../../../../lib/loginAudit";

const LOCAL_USERNAME = "admin";
const LOCAL_PASSWORD = "DisruptPartnerships2026";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  if (username !== LOCAL_USERNAME || password !== LOCAL_PASSWORD) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set("purewl_auth", username, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
  response.cookies.set("purewl_auth_name", "Admin", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
  response.cookies.set("purewl_auth_email", "admin@purewl.com", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
  response.cookies.set("purewl_auth_picture", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 0
  });

  await appendLoginAudit({
    name: "Admin",
    email: "admin@purewl.com",
    ip: getClientIp(request),
    logged_in_at: new Date().toISOString()
  });

  return response;
}

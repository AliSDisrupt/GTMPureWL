import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readLoginAudit } from "../../../../lib/loginAudit";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = cookies();
  const authUser = cookieStore.get("purewl_auth")?.value;
  if (!authUser) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const rows = await readLoginAudit();
  return NextResponse.json(rows);
}

import { promises as fs } from "node:fs";
import { dirname, resolve } from "node:path";
import type { NextRequest } from "next/server";

export type LoginAuditEntry = {
  name: string;
  email: string;
  ip: string;
  logged_in_at: string;
};

const LOGIN_AUDIT_FILE = resolve(process.cwd(), ".data", "user-logins.json");
const MAX_ENTRIES = 500;

async function ensureAuditFile(): Promise<void> {
  await fs.mkdir(dirname(LOGIN_AUDIT_FILE), { recursive: true });
  try {
    await fs.access(LOGIN_AUDIT_FILE);
  } catch {
    await fs.writeFile(LOGIN_AUDIT_FILE, "[]", "utf8");
  }
}

export async function readLoginAudit(): Promise<LoginAuditEntry[]> {
  await ensureAuditFile();
  try {
    const raw = await fs.readFile(LOGIN_AUDIT_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is LoginAuditEntry => {
        return (
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as LoginAuditEntry).name === "string" &&
          typeof (entry as LoginAuditEntry).email === "string" &&
          typeof (entry as LoginAuditEntry).ip === "string" &&
          typeof (entry as LoginAuditEntry).logged_in_at === "string"
        );
      })
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const [firstIp] = forwarded.split(",");
    return firstIp.trim();
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function appendLoginAudit(entry: LoginAuditEntry): Promise<void> {
  const current = await readLoginAudit();
  const next = [entry, ...current].slice(0, MAX_ENTRIES);
  await fs.writeFile(LOGIN_AUDIT_FILE, JSON.stringify(next, null, 2), "utf8");
}

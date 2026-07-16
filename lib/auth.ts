import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  verifySessionToken,
  signSession,
  sessionCookieOptions,
  clearSessionCookieOptions,
} from "@/lib/session";
import type { SessionUser } from "@/lib/types";

export {
  SESSION_COOKIE,
  verifySessionToken,
  signSession,
  sessionCookieOptions,
  clearSessionCookieOptions,
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function getSessionUserFromRequest(
  request: NextRequest,
): Promise<SessionUser | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

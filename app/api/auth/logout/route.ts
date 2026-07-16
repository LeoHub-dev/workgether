import { clearSessionCookieOptions } from "@/lib/auth";
import { jsonOk } from "@/lib/errors";

export async function POST() {
  const response = jsonOk({ ok: true });
  response.cookies.set(clearSessionCookieOptions());
  return response;
}

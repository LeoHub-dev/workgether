import { getSessionUser, sessionCookieOptions, signSession } from "@/lib/auth";
import { ApiError, jsonError, jsonOk } from "@/lib/errors";
import { hashPassword, validateCredentials, verifyPassword } from "@/lib/password";
import { getServiceSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username ?? "");
    const password = String(body.password ?? "");

    const validationError = validateCredentials(username, password);
    if (validationError) {
      throw new ApiError(400, validationError);
    }

    const normalized = username.trim();
    const supabase = getServiceSupabase();

    const { data: existing, error: lookupError } = await supabase
      .from("users")
      .select("id, username, password_hash")
      .eq("username", normalized)
      .maybeSingle();

    if (lookupError) {
      console.error(lookupError);
      throw new ApiError(500, "Could not look up user");
    }

    let userId: string;
    let created = false;

    if (!existing) {
      const password_hash = await hashPassword(password);
      const { data: createdUser, error: createError } = await supabase
        .from("users")
        .insert({ username: normalized, password_hash })
        .select("id, username")
        .single();

      if (createError || !createdUser) {
        console.error(createError);
        throw new ApiError(500, "Could not create user");
      }
      userId = createdUser.id;
      created = true;
    } else {
      const ok = await verifyPassword(password, existing.password_hash);
      if (!ok) {
        throw new ApiError(401, "Incorrect password for this username");
      }
      userId = existing.id;
    }

    const token = await signSession({ id: userId, username: normalized });
    const response = jsonOk({
      user: { id: userId, username: normalized },
      created,
    });
    response.cookies.set(sessionCookieOptions(token));
    return response;
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }
    return jsonOk({ user });
  } catch (error) {
    return jsonError(error);
  }
}

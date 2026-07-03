import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { parseSessionValue, sessionCookieName } from "@/lib/session";

export const runtime = "nodejs";

type UserRow = {
  id: string;
  email: string | null;
  nickname: string | null;
};

export async function GET() {
  const cookieStore = await cookies();
  const userId = parseSessionValue(cookieStore.get(sessionCookieName)?.value);

  if (!userId) {
    return NextResponse.json({ user: null });
  }

  const result = await query<UserRow>(
    `
      SELECT id, email, nickname
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId],
  );
  const user = result.rows[0] ?? null;

  return NextResponse.json({ user });
}

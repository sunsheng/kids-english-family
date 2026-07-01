import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

export const runtime = "nodejs";

type UserRow = {
  id: string;
  email: string | null;
  nickname: string | null;
  password_hash: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string; password?: string };
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json({ error: "请输入邮箱和密码。" }, { status: 400 });
  }

  const result = await query<UserRow>(
    `
      SELECT id, email, nickname, password_hash
      FROM users
      WHERE lower(email) = $1
      LIMIT 1
    `,
    [email],
  );
  const user = result.rows[0];

  if (!user || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ error: "邮箱或密码不正确。" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
    },
  });
}

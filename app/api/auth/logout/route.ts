import { NextResponse } from "next/server";
import { sessionCookieName } from "@/lib/session";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: sessionCookieName,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}

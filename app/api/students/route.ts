import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

type StudentRow = {
  id: string;
  user_id: string;
  name: string;
  school_stage: "primary" | "junior" | "senior";
  grade_label: string;
  preferred_accent: "us" | "uk";
  preferred_publisher: string;
  sort_order: number;
};

function isStage(value: unknown): value is StudentRow["school_stage"] {
  return value === "primary" || value === "junior" || value === "senior";
}

function isAccent(value: unknown): value is StudentRow["preferred_accent"] {
  return value === "us" || value === "uk";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "缺少 userId。" }, { status: 400 });
  }

  const result = await query<StudentRow>(
    `
      SELECT id, user_id, name, school_stage, grade_label, preferred_accent, preferred_publisher, sort_order
      FROM students
      WHERE user_id = $1
        AND deleted_at IS NULL
      ORDER BY sort_order ASC, created_at ASC
    `,
    [userId],
  );

  return NextResponse.json({ students: result.rows });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    userId?: string;
    name?: string;
    schoolStage?: unknown;
    gradeLabel?: string;
    preferredAccent?: unknown;
    preferredPublisher?: string;
  };

  const userId = body.userId;
  const name = body.name?.trim();
  const gradeLabel = body.gradeLabel?.trim();
  const schoolStage = body.schoolStage;
  const preferredAccent = body.preferredAccent ?? "us";
  const preferredPublisher = body.preferredPublisher?.trim() ?? "";

  if (!userId || !name || !gradeLabel || !isStage(schoolStage) || !isAccent(preferredAccent)) {
    return NextResponse.json({ error: "学员信息不完整。" }, { status: 400 });
  }

  const result = await query<StudentRow>(
    `
      INSERT INTO students (user_id, name, school_stage, grade_label, preferred_accent, preferred_publisher, sort_order)
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        COALESCE((SELECT max(sort_order) + 1 FROM students WHERE user_id = $1), 0)
      )
      RETURNING id, user_id, name, school_stage, grade_label, preferred_accent, preferred_publisher, sort_order
    `,
    [userId, name, schoolStage, gradeLabel, preferredAccent, preferredPublisher],
  );

  await query("INSERT INTO student_stats (student_id) VALUES ($1) ON CONFLICT DO NOTHING", [
    result.rows[0].id,
  ]);

  return NextResponse.json({ student: result.rows[0] }, { status: 201 });
}

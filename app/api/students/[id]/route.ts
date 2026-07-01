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
  sort_order: number;
};

function isStage(value: unknown): value is StudentRow["school_stage"] {
  return value === "primary" || value === "junior" || value === "senior";
}

function isAccent(value: unknown): value is StudentRow["preferred_accent"] {
  return value === "us" || value === "uk";
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    name?: string;
    schoolStage?: unknown;
    gradeLabel?: string;
    preferredAccent?: unknown;
  };

  const name = body.name?.trim();
  const gradeLabel = body.gradeLabel?.trim();
  const schoolStage = body.schoolStage;
  const preferredAccent = body.preferredAccent;

  if (!name || !gradeLabel || !isStage(schoolStage) || !isAccent(preferredAccent)) {
    return NextResponse.json({ error: "学员信息不完整。" }, { status: 400 });
  }

  const result = await query<StudentRow>(
    `
      UPDATE students
      SET name = $2,
          school_stage = $3,
          grade_label = $4,
          preferred_accent = $5,
          updated_at = now()
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING id, user_id, name, school_stage, grade_label, preferred_accent, sort_order
    `,
    [id, name, schoolStage, gradeLabel, preferredAccent],
  );

  if (!result.rows[0]) {
    return NextResponse.json({ error: "学员不存在。" }, { status: 404 });
  }

  return NextResponse.json({ student: result.rows[0] });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const result = await query<{ id: string }>(
    `
      UPDATE students
      SET deleted_at = now(),
          updated_at = now()
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING id
    `,
    [id],
  );

  if (!result.rows[0]) {
    return NextResponse.json({ error: "学员不存在。" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

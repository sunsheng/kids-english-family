import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { dictVoiceUrl } from "@/lib/audio";

export const runtime = "nodejs";

// 发音走有道 dictvoice(国内直连、免注册免 Key),音标直接读本地词库,
// 不再依赖境外的 dictionaryapi.dev。
export async function GET(request: Request, context: { params: Promise<{ word: string }> }) {
  const { word } = await context.params;
  const { searchParams } = new URL(request.url);
  const accent = searchParams.get("accent") === "uk" ? "uk" : "us";

  const result = await query<{ phonetic_us: string | null; phonetic_uk: string | null }>(
    `
      SELECT phonetic_us, phonetic_uk
      FROM words
      WHERE lower(spelling) = lower($1)
      LIMIT 1
    `,
    [word],
  );
  const row = result.rows[0];
  const phonetic = (accent === "uk" ? row?.phonetic_uk : row?.phonetic_us) ?? null;

  return NextResponse.json({
    phonetic,
    audioUrl: dictVoiceUrl(word, accent),
  });
}

import { NextResponse } from "next/server";

export const runtime = "nodejs";

type DictionaryPhonetic = {
  text?: string;
  audio?: string;
};

type DictionaryEntry = {
  phonetic?: string;
  phonetics?: DictionaryPhonetic[];
};

function selectPhonetic(entries: DictionaryEntry[], accent: "us" | "uk") {
  const phonetics = entries.flatMap((entry) => entry.phonetics ?? []);
  const accentPattern = accent === "us" ? /-us\.mp3|us\.mp3|\/us\//i : /-uk\.mp3|uk\.mp3|\/uk\//i;
  const exact = phonetics.find((item) => item.audio && accentPattern.test(item.audio));
  const withAudio = exact ?? phonetics.find((item) => item.audio);
  const withText = phonetics.find((item) => item.text);

  return {
    phonetic: withAudio?.text ?? withText?.text ?? entries[0]?.phonetic ?? null,
    audioUrl: withAudio?.audio ?? null,
  };
}

export async function GET(request: Request, context: { params: Promise<{ word: string }> }) {
  const { word } = await context.params;
  const { searchParams } = new URL(request.url);
  const accent = searchParams.get("accent") === "uk" ? "uk" : "us";

  const response = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    { next: { revalidate: 60 * 60 * 24 } },
  );

  if (!response.ok) {
    return NextResponse.json({ phonetic: null, audioUrl: null });
  }

  const entries = (await response.json()) as DictionaryEntry[];
  return NextResponse.json(selectPhonetic(entries, accent));
}

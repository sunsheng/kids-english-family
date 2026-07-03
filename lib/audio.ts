export type Accent = "us" | "uk";

// 有道词典发音接口:国内直连、免注册、免 Key。type=2 美音,type=1 英音。
export function dictVoiceUrl(word: string, accent: Accent) {
  const type = accent === "uk" ? 1 : 2;
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word.trim())}&type=${type}`;
}

// 全局唯一的声音播放器:所有页面共用同一个 <audio> 实例,保证任意时刻最多只播一个声音。
//
// 播放策略:
// 1. 后到优先 —— 新的播放请求总是先停掉正在播放的声音,再播放新声音
//    (新请求对应用户当前看到的单词,永远比旧声音重要);
// 2. 自动播放去重 —— 相同 key 的请求在窗口期内(默认 1.2 秒)只播一次,
//    防止 React effect 重复触发、组件重挂载造成的重播/多播;
// 3. 手动重播(replay)不去重,总是打断当前声音从头播放。

const DEFAULT_DEDUPE_MS = 1200;

type PlayOptions = {
  /** 播放任务标识(如 `learning-<wordId>`),相同 key 在窗口期内的重复请求会被忽略。 */
  key?: string;
  /** 去重窗口,毫秒。传 0 表示不去重。 */
  dedupeMs?: number;
};

class AudioPlayerManager {
  private audio: HTMLAudioElement | null = null;
  private currentKey: string | null = null;
  private startedAt = 0;
  private isActive = false;

  private ensureAudio(): HTMLAudioElement | null {
    if (typeof window === "undefined") {
      return null;
    }

    if (!this.audio) {
      this.audio = new window.Audio();
      this.audio.preload = "auto";
      const markIdle = () => {
        this.isActive = false;
      };
      this.audio.addEventListener("ended", markIdle);
      this.audio.addEventListener("error", markIdle);
    }

    return this.audio;
  }

  play(url: string | null, options: PlayOptions = {}) {
    if (!url) {
      return;
    }

    const audio = this.ensureAudio();
    if (!audio) {
      return;
    }

    const { key = url, dedupeMs = DEFAULT_DEDUPE_MS } = options;
    const now = Date.now();

    if (key === this.currentKey && this.isActive && now - this.startedAt < dedupeMs) {
      return;
    }

    audio.pause();
    this.currentKey = key;
    this.startedAt = now;
    this.isActive = true;
    audio.src = url;
    void audio.play().catch(() => {
      this.isActive = false;
    });
  }

  /** 手动重播:总是打断当前声音,从头播放指定音频。 */
  replay(url: string | null) {
    this.play(url, { dedupeMs: 0 });
  }

  stop() {
    if (!this.audio) {
      return;
    }

    this.audio.pause();
    this.isActive = false;
    this.currentKey = null;
  }
}

export const audioPlayer = new AudioPlayerManager();

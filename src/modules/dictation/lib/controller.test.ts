import { describe, expect, it } from "vitest";
import type { MessageInput } from "@/modules/messages/lib/messages";
import {
  createDictation,
  type DictationDeps,
  MAX_LISTEN_MS,
} from "./controller";

function setup(over: Partial<DictationDeps> = {}) {
  const posts: MessageInput[] = [];
  const pasted: [number, string][] = [];
  const timers: (() => void)[] = [];
  let ready = true;
  let stopped = 0;
  let cancelled = 0;
  const deps: DictationDeps = {
    model: () => "tiny.en",
    keys: () => "Ctrl+B Ctrl+Space",
    modelReady: async () => ready,
    download: async (_m, onPct) => {
      onPct(50);
      onPct(100);
      ready = true;
    },
    startRecording: async () => ({
      stop: async () => {
        stopped++;
        return new Float32Array(16000);
      },
      cancel: () => {
        cancelled++;
      },
    }),
    transcribe: async () => " [BLANK_AUDIO] git status ",
    paste: (leaf, text) => {
      pasted.push([leaf, text]);
      return true;
    },
    describe: (leaf) => ({
      label: `Pane ${leaf}`,
      target: { tabId: 1, leafId: leaf },
    }),
    post: (m) => posts.push(m),
    setTimer: (fn) => {
      timers.push(fn);
      return timers.length;
    },
    clearTimer: () => {},
    ...over,
  };
  const d = createDictation(deps);
  return {
    d,
    posts,
    pasted,
    timers,
    last: () => posts[posts.length - 1],
    setReady: (v: boolean) => {
      ready = v;
    },
    counts: () => ({ stopped, cancelled }),
  };
}

describe("dictation", () => {
  it("toggles: listen, then transcribe into the pane it started in", async () => {
    const t = setup();
    await t.d.toggle(2);
    expect(t.d.phase()).toBe("listening");
    expect(t.last()).toMatchObject({
      text: "Listening in pane 2. Ctrl+B Ctrl+Space to stop, Esc to cancel.",
      sticky: true,
      key: "dictation",
    });
    await t.d.toggle(3); // focus moved; text still goes to pane 2
    expect(t.pasted).toEqual([[2, "git status"]]);
    expect(t.last()).toMatchObject({
      text: "Dictated 2 words into pane 2.",
      kind: "success",
      target: { tabId: 1, leafId: 2 },
    });
    expect(t.d.phase()).toBe("idle");
  });

  it("says when nothing was heard, and types nothing", async () => {
    const t = setup({ transcribe: async () => "[BLANK_AUDIO]" });
    await t.d.toggle(1);
    await t.d.toggle(1);
    expect(t.pasted).toEqual([]);
    expect(t.last()?.text).toBe("Heard nothing.");
  });

  it("Esc cancels while listening, without transcribing", async () => {
    const t = setup();
    await t.d.toggle(1);
    expect(t.d.cancel()).toBe(true);
    expect(t.counts()).toEqual({ stopped: 0, cancelled: 1 });
    expect(t.last()?.text).toBe("Dictation cancelled.");
    expect(t.d.phase()).toBe("idle");
    expect(t.d.cancel()).toBe(false); // nothing to cancel: let Esc through
  });

  it("stops by itself after the time limit", async () => {
    const t = setup();
    await t.d.toggle(1);
    expect(MAX_LISTEN_MS).toBe(120_000);
    t.timers[0]();
    await new Promise((r) => setTimeout(r, 0));
    expect(t.pasted).toEqual([[1, "git status"]]);
  });

  it("a missing model downloads first, then waits for the next press", async () => {
    const t = setup();
    t.setReady(false);
    await t.d.toggle(1);
    const texts = t.posts.map((p) => p.text);
    expect(texts).toEqual([
      "Downloading the speech model (32 MB): 0%.",
      "Downloading the speech model (32 MB): 50%.",
      "Downloading the speech model (32 MB): 100%.",
      "Speech model ready. Press Ctrl+B Ctrl+Space to dictate.",
    ]);
    expect(t.posts[0].sticky).toBe(true);
    expect(t.d.phase()).toBe("idle");
  });

  it("reports a refused microphone and a failed download as errors", async () => {
    const mic = setup({
      startRecording: async () => {
        throw new Error("NotAllowedError");
      },
    });
    await mic.d.toggle(1);
    expect(mic.last()).toMatchObject({
      text: "Microphone access was refused.",
      kind: "error",
    });
    expect(mic.d.phase()).toBe("idle");

    const dl = setup({
      download: async () => {
        throw new Error("checksum mismatch");
      },
    });
    dl.setReady(false);
    await dl.d.toggle(1);
    expect(dl.last()).toMatchObject({
      text: "The speech model download failed: checksum mismatch",
      kind: "error",
    });
  });

  it("needs a terminal pane", async () => {
    const t = setup();
    await t.d.toggle(null);
    expect(t.last()).toMatchObject({
      text: "Focus a terminal to dictate.",
      kind: "warning",
    });
    expect(t.d.phase()).toBe("idle");
  });

  it("warns when the pane closed before the text arrived", async () => {
    const t = setup({ paste: () => false });
    await t.d.toggle(1);
    await t.d.toggle(1);
    expect(t.last()).toMatchObject({
      text: "The pane closed before the text arrived.",
      kind: "warning",
    });
  });
});

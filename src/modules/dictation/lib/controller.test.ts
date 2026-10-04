import { describe, expect, it } from "vitest";
import type { MessageInput } from "@/modules/messages/lib/messages";
import type { Seg } from "./agreement";
import {
  createDictation,
  type DictationDeps,
  MAX_LISTEN_MS,
  PASS_MS,
} from "./controller";

const seg = (text: string, endMs = 1000): Seg => ({ text, startMs: 0, endMs });
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(over: Partial<DictationDeps> = {}) {
  const posts: MessageInput[] = [];
  const pasted: [number, string][] = [];
  const timers: { fn: () => void; ms: number; live: boolean }[] = [];
  const prompts: string[] = [];
  const trims: number[] = [];
  const script: Seg[][] = [];
  let ready = true;
  let cancelled = 0;
  let pending: (() => void) | null = null;
  let holdNext = false;
  const deps: DictationDeps = {
    model: () => "tiny.en",
    keys: () => "Ctrl+B Ctrl+Space",
    modelReady: async () => ready,
    download: async (_m, onPct) => {
      onPct(50);
      onPct(100);
      ready = true;
    },
    startMic: async () => ({
      snapshot: () => new Float32Array(16_000),
      trim: (ms) => trims.push(ms),
      stop: () => new Float32Array(16_000),
      cancel: () => {
        cancelled++;
      },
    }),
    transcribeLive: (_m, _samples, prompt) => {
      prompts.push(prompt);
      const out = script.shift() ?? [];
      if (!holdNext) return Promise.resolve(out);
      holdNext = false;
      return new Promise((r) => {
        pending = () => r(out);
      });
    },
    paste: (leaf, text) => {
      pasted.push([leaf, text]);
      return true;
    },
    describe: (leaf) => ({
      label: `Pane ${leaf}`,
      target: { tabId: 1, leafId: leaf },
    }),
    post: (m) => posts.push(m),
    setTimer: (fn, ms) => {
      timers.push({ fn, ms, live: true });
      return timers.length - 1;
    },
    clearTimer: (h) => {
      if (typeof h === "number" && timers[h]) timers[h].live = false;
    },
    ...over,
  };
  const d = createDictation(deps);
  const fire = async (ms: number) => {
    const t = [...timers].reverse().find((x) => x.live && x.ms === ms);
    if (!t) throw new Error(`no live ${ms}ms timer`);
    t.live = false;
    t.fn();
    await flush();
  };
  const passTimers = () =>
    timers.filter((t) => t.live && t.ms === PASS_MS).length;
  return {
    d,
    deps,
    posts,
    pasted,
    prompts,
    trims,
    script,
    fire,
    passTimers,
    last: () => posts[posts.length - 1],
    setReady: (v: boolean) => {
      ready = v;
    },
    hold: () => {
      holdNext = true;
    },
    release: async () => {
      pending?.();
      pending = null;
      await flush();
    },
    cancelled: () => cancelled,
  };
}

describe("live dictation", () => {
  it("types words once two passes agree, the rest when you stop", async () => {
    const t = setup();
    t.script.push([seg(" git commit")], [seg(" git commit dash")]);
    await t.d.toggle(2);
    expect(t.last()).toMatchObject({
      text: "Listening in pane 2. Ctrl+B Ctrl+Space to stop, Esc to cancel.",
      sticky: true,
    });

    await t.fire(PASS_MS);
    expect(t.pasted).toEqual([]);
    expect(t.last()?.text).toBe("Listening in pane 2: …git commit");

    await t.fire(PASS_MS);
    expect(t.pasted).toEqual([[2, "git commit"]]);
    expect(t.last()?.text).toBe("Listening in pane 2: …dash");

    t.script.push([seg(" git commit dash m fix")]);
    await t.d.toggle(3); // focus moved: still pane 2
    await flush();
    expect(t.pasted).toEqual([
      [2, "git commit"],
      [2, " dash m fix"],
    ]);
    expect(t.last()).toMatchObject({
      text: "Dictated 5 words into pane 2.",
      kind: "success",
      target: { tabId: 1, leafId: 2 },
    });
    expect(t.d.phase()).toBe("idle");
  });

  it("gives Whisper the typed words as context, and passes trims to the mic", async () => {
    const t = setup();
    t.script.push(
      [seg("git status.", 1000), seg(" then push", 2000)],
      [seg("git status.", 1000), seg(" then", 1800)],
      [seg(" then push", 900)],
    );
    await t.d.toggle(1);
    await t.fire(PASS_MS);
    await t.fire(PASS_MS);
    expect(t.trims).toEqual([1000]);
    await t.fire(PASS_MS);
    expect(t.prompts).toEqual(["", "", "git status. then"]);
  });

  it("never runs two passes at once", async () => {
    const t = setup();
    t.script.push([seg("ls")]);
    await t.d.toggle(1);
    t.hold();
    await t.fire(PASS_MS);
    expect(t.passTimers()).toBe(0); // the next pass waits for this one
    await t.release();
    expect(t.passTimers()).toBe(1);
  });

  it("stopping mid-pass waits for it, then does one final pass", async () => {
    const t = setup();
    t.script.push([seg("ls -la")], [seg("ls -la")]);
    await t.d.toggle(1);
    t.hold();
    await t.fire(PASS_MS);
    const stopping = t.d.toggle(1);
    expect(t.d.phase()).toBe("transcribing");
    await t.release();
    await stopping;
    expect(t.pasted).toEqual([[1, "ls -la"]]);
    expect(t.last()?.text).toBe("Dictated 2 words into pane 1.");
  });

  it("Esc stops; words already typed stay, the rest are dropped", async () => {
    const t = setup();
    t.script.push([seg("git push")], [seg("git push origin")]);
    await t.d.toggle(1);
    await t.fire(PASS_MS);
    await t.fire(PASS_MS);
    expect(t.d.cancel()).toBe(true);
    expect(t.cancelled()).toBe(1);
    expect(t.pasted).toEqual([[1, "git push"]]);
    expect(t.last()?.text).toBe(
      "Dictation stopped. Kept the 2 words already typed.",
    );
    expect(t.d.cancel()).toBe(false);
  });

  it("Esc before anything was typed just cancels", async () => {
    const t = setup();
    await t.d.toggle(1);
    expect(t.d.cancel()).toBe(true);
    expect(t.last()?.text).toBe("Dictation cancelled.");
  });

  it("says when nothing was heard", async () => {
    const t = setup();
    t.script.push([seg("[BLANK_AUDIO]")]);
    await t.d.toggle(1);
    await t.d.toggle(1);
    expect(t.pasted).toEqual([]);
    expect(t.last()?.text).toBe("Heard nothing.");
  });

  it("stops by itself after the time limit", async () => {
    const t = setup();
    expect(MAX_LISTEN_MS).toBe(120_000);
    t.script.push([seg("pwd")]);
    await t.d.toggle(1);
    await t.fire(MAX_LISTEN_MS);
    expect(t.pasted).toEqual([[1, "pwd"]]);
    expect(t.d.phase()).toBe("idle");
  });

  it("stops when the pane closes mid-dictation", async () => {
    const t = setup({ paste: () => false });
    t.script.push([seg("make test")], [seg("make test")]);
    await t.d.toggle(1);
    await t.fire(PASS_MS);
    await t.fire(PASS_MS);
    expect(t.cancelled()).toBe(1);
    expect(t.last()).toMatchObject({
      text: "The pane closed; dictation stopped.",
      kind: "warning",
    });
    expect(t.d.phase()).toBe("idle");
  });

  it("a missing model downloads first, then waits for the next press", async () => {
    const t = setup();
    t.setReady(false);
    await t.d.toggle(1);
    expect(t.posts.map((p) => p.text)).toEqual([
      "Downloading the speech model (32 MB): 0%.",
      "Downloading the speech model (32 MB): 50%.",
      "Downloading the speech model (32 MB): 100%.",
      "Speech model ready. Press Ctrl+B Ctrl+Space to dictate.",
    ]);
    expect(t.d.phase()).toBe("idle");
  });

  it("reports a refused microphone, a failed download and a missing pane", async () => {
    const mic = setup({
      startMic: async () => {
        throw new Error("NotAllowedError");
      },
    });
    await mic.d.toggle(1);
    expect(mic.last()).toMatchObject({
      text: "Microphone access was refused.",
      kind: "error",
    });

    const dl = setup({
      download: async () => {
        throw new Error("checksum mismatch");
      },
    });
    dl.setReady(false);
    await dl.d.toggle(1);
    expect(dl.last()?.text).toBe(
      "The speech model download failed: checksum mismatch",
    );

    const none = setup();
    await none.d.toggle(null);
    expect(none.last()).toMatchObject({
      text: "Focus a terminal to dictate.",
      kind: "warning",
    });
  });
});

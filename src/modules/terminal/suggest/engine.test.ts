import { describe, expect, it } from "vitest";
import { acceptKind, createSuggestEngine, nextWord, suffixFor } from "./engine";

const flush = () => new Promise((r) => setTimeout(r, 0));
const key = (k: string, mods: Partial<KeyboardEvent> = {}) =>
  ({
    key: k,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    ...mods,
  }) as KeyboardEvent;

function setup(
  history: Record<string, string> = {
    g: "git status",
    "git c": "git commit -m fix",
  },
) {
  const shown: (string | null)[] = [];
  const recorded: string[] = [];
  let enabled = true;
  const e = createSuggestEngine({
    enabled: () => enabled,
    suggest: async (line) => {
      const hit = Object.entries(history)
        .filter(([p]) => line.startsWith(p))
        .sort((a, b) => b[0].length - a[0].length)[0];
      return hit?.[1].startsWith(line) ? hit[1] : null;
    },
    record: (c) => recorded.push(c),
    show: (s) => shown.push(s),
  });
  return {
    e,
    shown,
    recorded,
    last: () => shown[shown.length - 1],
    setEnabled: (v: boolean) => {
      enabled = v;
    },
  };
}

describe("text helpers", () => {
  it("suffixFor gives the untyped rest, or nothing", () => {
    expect(suffixFor("git st", "git status")).toBe("atus");
    expect(suffixFor("git status", "git status")).toBeNull();
    expect(suffixFor("ls", "git status")).toBeNull();
  });

  it("nextWord takes the leading blanks and one word", () => {
    expect(nextWord(" commit -m fix")).toBe(" commit");
    expect(nextWord("mit -m fix")).toBe("mit");
    expect(nextWord("x")).toBe("x");
  });

  it("acceptKind: Right/End/Ctrl+F take it all, Ctrl or Option+Right one word", () => {
    expect(acceptKind(key("ArrowRight"))).toBe("all");
    expect(acceptKind(key("End"))).toBe("all");
    expect(acceptKind(key("f", { ctrlKey: true }))).toBe("all");
    expect(acceptKind(key("ArrowRight", { ctrlKey: true }))).toBe("word");
    expect(acceptKind(key("ArrowRight", { altKey: true }))).toBe("word");
    expect(acceptKind(key("ArrowRight", { shiftKey: true }))).toBeNull();
    expect(acceptKind(key("a"))).toBeNull();
  });
});

describe("suggest engine", () => {
  it("suggests from history as you type at a prompt", async () => {
    const t = setup();
    t.e.promptState(false);
    t.e.input("g");
    await flush();
    expect(t.last()).toBe("it status");
    t.e.input("i");
    expect(t.last()).toBe("t status"); // narrowed at once, before history answers
  });

  it("says nothing while a command runs, or before any prompt", async () => {
    const t = setup();
    t.e.input("g");
    await flush();
    expect(t.shown.filter(Boolean)).toEqual([]);
    t.e.promptState(false);
    t.e.promptState(true);
    t.e.input("g");
    await flush();
    expect(t.shown.filter(Boolean)).toEqual([]);
  });

  it("hides once the line is unsure (Tab, history, cursor moves)", async () => {
    const t = setup();
    t.e.promptState(false);
    t.e.input("g");
    await flush();
    t.e.input("\t");
    expect(t.last()).toBeNull();
    t.e.input("x");
    await flush();
    expect(t.last()).toBeNull();
  });

  it("accepts all or one word, and keeps the line in step", async () => {
    const t = setup();
    t.e.promptState(false);
    t.e.input("git c");
    await flush();
    expect(t.e.accept("word")).toBe("ommit");
    expect(t.last()).toBe(" -m fix");
    expect(t.e.accept("all")).toBe(" -m fix");
    expect(t.last()).toBeNull();
    expect(t.e.accept("all")).toBeNull(); // nothing left to take
  });

  it("remembers what you run, so this session's commands are suggested", () => {
    const t = setup();
    t.e.promptState(false);
    t.e.input("npm run dev\r");
    expect(t.recorded).toEqual(["npm run dev"]);
    t.e.input("git\t\r"); // unsure: not recorded
    expect(t.recorded).toEqual(["npm run dev"]);
  });

  it("stays out of the way when the shell suggests by itself, or when off", async () => {
    const t = setup();
    t.e.promptState(false);
    t.e.markShellSuggests();
    t.e.input("g");
    await flush();
    expect(t.shown.filter(Boolean)).toEqual([]);

    const off = setup();
    off.setEnabled(false);
    off.e.promptState(false);
    off.e.input("g");
    await flush();
    expect(off.shown.filter(Boolean)).toEqual([]);
  });

  it("ignores a history answer that arrives after the line moved on", async () => {
    const t = setup({ g: "git status", gx: "gx-tool" });
    t.e.promptState(false);
    t.e.input("g");
    t.e.input("\x7f");
    await flush();
    expect(t.last()).toBeNull();
  });
});

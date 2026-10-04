import { describe, expect, it } from "vitest";
import {
  cleanTranscript,
  dictatedMessage,
  dictationKeys,
  downloadingMessage,
  listeningMessage,
  MODELS,
  readyMessage,
  wordCount,
} from "./text";

describe("cleanTranscript", () => {
  it("drops Whisper's bracketed markers and collapses whitespace", () => {
    expect(cleanTranscript("  [BLANK_AUDIO] git   status\n")).toBe(
      "git status",
    );
    expect(cleanTranscript("[ Silence ]")).toBe("");
    expect(cleanTranscript("(upbeat music) list the files ♪")).toBe(
      "list the files",
    );
  });

  it("keeps ordinary parentheses", () => {
    expect(cleanTranscript("add a flag (optional) here")).toBe(
      "add a flag (optional) here",
    );
  });

  it("counts words", () => {
    expect(wordCount("git commit -m fix")).toBe(4);
    expect(wordCount("")).toBe(0);
  });
});

describe("wording", () => {
  it("names the keys for the prefix in use", () => {
    expect(dictationKeys("ctrl+b")).toBe("Ctrl+B Ctrl+Space");
    expect(dictationKeys("ctrl+a")).toBe("Ctrl+A Ctrl+Space");
    expect(dictationKeys("ctrl+space")).toBe("Ctrl+Space v");
  });

  it("says what is happening", () => {
    expect(downloadingMessage("tiny.en", 42)).toBe(
      "Downloading the speech model (32 MB): 42%.",
    );
    expect(readyMessage("Ctrl+B Ctrl+Space")).toBe(
      "Speech model ready. Press Ctrl+B Ctrl+Space to dictate.",
    );
    expect(listeningMessage("Pane 2", "Ctrl+B Ctrl+Space")).toBe(
      "Listening in pane 2. Ctrl+B Ctrl+Space to stop, Esc to cancel.",
    );
    expect(dictatedMessage(12, "Pane 2")).toBe(
      "Dictated 12 words into pane 2.",
    );
    expect(dictatedMessage(1, "Pane 1")).toBe("Dictated 1 word into pane 1.");
  });

  it("lists both models, tiny.en first", () => {
    expect(MODELS.map((m) => [m.id, m.mb])).toEqual([
      ["tiny.en", 32],
      ["base.en", 60],
    ]);
  });
});

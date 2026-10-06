import { describe, expect, it } from "vitest";
import { applyInput, FRESH } from "./lineModel";

const type = (...chunks: string[]) =>
  chunks.reduce((s, c) => applyInput(s, c).state, FRESH);

describe("applyInput", () => {
  it("follows plain typing, Backspace and paste", () => {
    expect(type("g", "i", "t", " st")).toEqual({
      text: "git st",
      certain: true,
    });
    expect(type("git", "\x7f")).toEqual({ text: "gi", certain: true });
    expect(type("\x7f")).toEqual({ text: "", certain: true });
    expect(type("\x1b[200~ls -la\x1b[201~")).toEqual({
      text: "ls -la",
      certain: true,
    });
  });

  it("follows Ctrl+U, Ctrl+W and Ctrl+C", () => {
    expect(type("git commit", "\x15")).toEqual({ text: "", certain: true });
    expect(type("git commit -m", "\x17")).toEqual({
      text: "git commit ",
      certain: true,
    });
    expect(type("git commit  ", "\x17")).toEqual({
      text: "git ",
      certain: true,
    });
    expect(type("rm -rf", "\x03")).toEqual({ text: "", certain: true });
  });

  it("reports Enter with what was typed, and starts a new line", () => {
    const r = applyInput(type("make test"), "\r");
    expect(r.submitted).toBe("make test");
    expect(r.state).toEqual({ text: "", certain: true });
  });

  it("gives up when the shell changes the line where it can't be seen", () => {
    for (const key of [
      "\t",
      "\x1b[A",
      "\x1b[B",
      "\x1b[D",
      "\x01",
      "\x12",
      "\x1bb",
      "\x1b",
    ]) {
      expect(type("git", key).certain, JSON.stringify(key)).toBe(false);
    }
    // A multi-line paste may run commands: unknowable.
    expect(type("\x1b[200~ls\nrm x\x1b[201~").certain).toBe(false);
  });

  it("keeps keys that do nothing at the end of the line", () => {
    for (const key of ["\x1b[C", "\x05", "\x0b", "\x0c", "\x1b[F", "\x1bOF"]) {
      expect(type("git", key), JSON.stringify(key)).toEqual({
        text: "git",
        certain: true,
      });
    }
  });

  it("stays unsure until Enter, Ctrl+C or a new prompt", () => {
    expect(type("git", "\t", "x").certain).toBe(false);
    const r = applyInput(type("git", "\t"), "\r");
    expect(r.submitted).toBeUndefined();
    expect(r.state).toEqual({ text: "", certain: true });
    expect(type("git", "\t", "\x03")).toEqual({ text: "", certain: true });
  });
});

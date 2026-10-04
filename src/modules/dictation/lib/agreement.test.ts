import { describe, expect, it } from "vitest";
import {
  EMPTY_AGREEMENT,
  finishAgreement,
  type Seg,
  stepAgreement,
} from "./agreement";

const seg = (text: string, startMs: number, endMs: number): Seg => ({
  text,
  startMs,
  endMs,
});

describe("stepAgreement", () => {
  it("commits nothing on the first pass: a word must be heard twice", () => {
    const r = stepAgreement(EMPTY_AGREEMENT, [seg(" git commit", 0, 900)]);
    expect(r.commit).toEqual([]);
    expect(r.tail).toEqual(["git", "commit"]);
  });

  it("commits the words two passes agree on, ignoring case and punctuation", () => {
    const a = stepAgreement(EMPTY_AGREEMENT, [seg(" Git commit", 0, 900)]);
    const b = stepAgreement(a.state, [seg(" git commit, dash", 0, 1500)]);
    expect(b.commit).toEqual(["git", "commit,"]); // the newer pass's spelling
    expect(b.tail).toEqual(["dash"]);
  });

  it("never commits a word twice", () => {
    let s = stepAgreement(EMPTY_AGREEMENT, [seg("git commit", 0, 900)]).state;
    s = stepAgreement(s, [seg("git commit dash", 0, 1500)]).state;
    const c = stepAgreement(s, [seg("git commit dash m", 0, 2000)]);
    expect(c.commit).toEqual(["dash"]);
    expect(c.tail).toEqual(["m"]);
  });

  it("stops at the first word the passes disagree on", () => {
    const a = stepAgreement(EMPTY_AGREEMENT, [seg("get status now", 0, 900)]);
    const b = stepAgreement(a.state, [seg("git status now", 0, 1200)]);
    expect(b.commit).toEqual([]);
    expect(b.tail).toEqual(["git", "status", "now"]);
  });

  it("trims audio after a phrase whose words are all typed", () => {
    let s = stepAgreement(EMPTY_AGREEMENT, [
      seg("git status.", 0, 1000),
      seg(" then push", 1000, 2000),
    ]).state;
    const b = stepAgreement(s, [
      seg("git status.", 0, 1000),
      seg(" then", 1000, 1800),
    ]);
    expect(b.commit).toEqual(["git", "status.", "then"]);
    expect(b.trimMs).toBe(1000); // the first phrase is fully typed
    s = b.state;
    // The trimmed audio no longer holds "git status."; "then" is still in it.
    const c = stepAgreement(s, [seg(" then push", 0, 900)]);
    expect(c.commit).toEqual([]);
    expect(c.tail).toEqual(["push"]);
    const d = stepAgreement(c.state, [seg(" then push it", 0, 1300)]);
    expect(d.commit).toEqual(["push"]);
  });

  it("drops Whisper's markers before comparing", () => {
    const a = stepAgreement(EMPTY_AGREEMENT, [seg("[BLANK_AUDIO]", 0, 1000)]);
    expect(a.tail).toEqual([]);
  });

  it("keeps the context prompt to the typed words", () => {
    let s = stepAgreement(EMPTY_AGREEMENT, [seg("git commit", 0, 900)]).state;
    s = stepAgreement(s, [seg("git commit dash", 0, 1500)]).state;
    expect(s.typed).toEqual(["git", "commit"]);
  });
});

describe("finishAgreement", () => {
  it("commits everything not yet typed on the last pass", () => {
    let s = stepAgreement(EMPTY_AGREEMENT, [seg("git commit", 0, 900)]).state;
    s = stepAgreement(s, [seg("git commit dash", 0, 1500)]).state;
    expect(finishAgreement(s, [seg("git commit dash m fix", 0, 2500)])).toEqual(
      ["dash", "m", "fix"],
    );
  });

  it("commits nothing when the last pass heard nothing new", () => {
    let s = stepAgreement(EMPTY_AGREEMENT, [seg("ls", 0, 500)]).state;
    s = stepAgreement(s, [seg("ls", 0, 700)]).state;
    expect(finishAgreement(s, [seg("ls", 0, 700)])).toEqual([]);
  });
});

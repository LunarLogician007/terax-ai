import { describe, expect, it } from "vitest";
import {
  closePaneMessage,
  closeTabMessage,
  copyMessage,
  dismissMessage,
  durationFor,
  EMPTY,
  HISTORY_CAP,
  pasteMessage,
  pushMessage,
  visibleMessage,
} from "./messages";

describe("wording, in tuios's style", () => {
  it("a multi-line copy names the pane, the line count and a preview", () => {
    expect(
      copyMessage(
        "The latest build is installed\nand open\non your screen",
        "Pane 1",
      ),
    ).toBe(
      'Pane 1 copied 3 lines to the clipboard: "The latest build is installed and open o...".',
    );
  });
  it("a short multi-line copy is quoted whole", () => {
    expect(copyMessage("ls\npwd\n", "Pane 2")).toBe(
      'Pane 2 copied 2 lines to the clipboard: "ls pwd".',
    );
  });
  it("a one-line copy just counts characters", () => {
    expect(copyMessage("hello world", "Pane 1")).toBe("Copied 11 chars.");
  });
  it("paste says how much went into which pane", () => {
    expect(pasteMessage("a\nb\nc", "Pane 2")).toBe(
      "Pasted 3 lines into pane 2.",
    );
    expect(pasteMessage("npm run dev", "Pane 1")).toBe(
      "Pasted 11 chars into pane 1.",
    );
  });
  it("closing names the pane or the tab", () => {
    expect(closePaneMessage("Pane 2")).toBe("Closed pane 2.");
    expect(closeTabMessage("terax")).toBe('Closed tab "terax".');
  });
});

describe("the message queue", () => {
  const id = (() => {
    let n = 0;
    return () => `m${++n}`;
  })();

  it("shows the newest message until its time runs out", () => {
    let s = pushMessage(EMPTY, { text: "one", kind: "info" }, 0, id);
    s = pushMessage(s, { text: "two", kind: "success" }, 100, id);
    expect(visibleMessage(s, 200)?.text).toBe("two");
    expect(
      visibleMessage(s, 100 + (durationFor("success") ?? 0) + 1),
    ).toBeNull();
  });

  it("warnings stay twice as long and errors stay until dismissed", () => {
    expect(durationFor("warning")).toBe(2 * (durationFor("info") ?? 0));
    const s = pushMessage(EMPTY, { text: "boom", kind: "error" }, 0, id);
    const shown = visibleMessage(s, 10 * 60_000);
    expect(shown?.text).toBe("boom");
    expect(
      visibleMessage(dismissMessage(s, shown?.id ?? ""), 10 * 60_000),
    ).toBeNull();
  });

  it("a message with the same key is updated in place, not stacked", () => {
    let s = pushMessage(
      EMPTY,
      { text: "copied a", kind: "info", key: "copy:1" },
      0,
      id,
    );
    s = pushMessage(s, { text: "other", kind: "info" }, 10, id);
    s = pushMessage(
      s,
      { text: "copied b", kind: "info", key: "copy:1" },
      20,
      id,
    );
    expect(s.history.map((m) => m.text)).toEqual(["copied b", "other"]);
    expect(visibleMessage(s, 30)?.text).toBe("copied b");
  });

  it("keeps a bounded history, newest first", () => {
    let s = EMPTY;
    for (let i = 0; i < HISTORY_CAP + 5; i++) {
      s = pushMessage(s, { text: `m${i}`, kind: "info" }, i, id);
    }
    expect(s.history).toHaveLength(HISTORY_CAP);
    expect(s.history[0].text).toBe(`m${HISTORY_CAP + 4}`);
  });

  it("dismissing the visible message hides it", () => {
    const s = pushMessage(EMPTY, { text: "hi", kind: "info" }, 0, id);
    const m = visibleMessage(s, 1);
    expect(visibleMessage(dismissMessage(s, m?.id ?? ""), 2)).toBeNull();
  });
});

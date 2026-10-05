import { describe, expect, it } from "vitest";
import { legacyThemeId, migrateLegacyKeys } from "./legacyStorage";

function fakeStorage(init: Record<string, string>) {
  const m = new Map(Object.entries(init));
  return {
    m,
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
  };
}

describe("migrateLegacyKeys", () => {
  it("moves terax keys to their toss names", () => {
    const s = fakeStorage({
      "terax.sidebar.width": "280",
      "terax-palette-mru": "{}",
      unrelated: "x",
    });
    migrateLegacyKeys(s);
    expect(Object.fromEntries(s.m)).toEqual({
      "toss.sidebar.width": "280",
      "toss-palette-mru": "{}",
      unrelated: "x",
    });
  });

  it("never overwrites a value the new app already wrote", () => {
    const s = fakeStorage({
      "terax.sidebar.width": "280",
      "toss.sidebar.width": "300",
    });
    migrateLegacyKeys(s);
    expect(s.m.get("toss.sidebar.width")).toBe("300");
    expect(s.m.has("terax.sidebar.width")).toBe(false);
  });

  it("maps the old default theme id in the theme shortcut", () => {
    const s = fakeStorage({ "terax-ui-theme-id-shadow": "terax-default" });
    migrateLegacyKeys(s);
    expect(s.m.get("toss-ui-theme-id-shadow")).toBe("toss-default");
  });

  it("survives storage that throws (private mode, blocked)", () => {
    const broken = {
      get length(): number {
        throw new Error("blocked");
      },
      key: () => null,
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    expect(() => migrateLegacyKeys(broken)).not.toThrow();
  });
});

describe("legacyThemeId", () => {
  it("renames terax theme ids and leaves others alone", () => {
    expect(legacyThemeId("terax-default")).toBe("toss-default");
    expect(legacyThemeId("dracula")).toBe("dracula");
  });
});

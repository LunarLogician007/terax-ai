import { describe, expect, it } from "vitest";
import { clampWindowOpacity } from "@/modules/settings/store";
import { translucentOverrides, withAlpha } from "./translucency";

describe("withAlpha", () => {
  it("adds an alpha to rgb(), rgba() and hex colours", () => {
    expect(withAlpha("rgb(20, 20, 20)", 0.85)).toBe("rgba(20, 20, 20, 0.85)");
    expect(withAlpha("rgba(20, 20, 20, 1)", 0.5)).toBe("rgba(20, 20, 20, 0.5)");
    expect(withAlpha("#141414", 0.85)).toBe("rgba(20, 20, 20, 0.85)");
    expect(withAlpha("#fff", 0.4)).toBe("rgba(255, 255, 255, 0.4)");
  });
  it("handles any other CSS colour, such as WebKit's lab(), with color-mix", () => {
    // WebKit reports TOSS Terminal's theme colours as lab(); returning them unchanged
    // left the backdrop opaque (seen in the runtime report).
    expect(withAlpha("lab(2.93655 -0.435196 -0.608262)", 0.7)).toBe(
      "color-mix(in srgb, lab(2.93655 -0.435196 -0.608262) 70%, transparent)",
    );
    expect(withAlpha("oklch(0.2 0 0)", 0.25)).toBe(
      "color-mix(in srgb, oklch(0.2 0 0) 25%, transparent)",
    );
  });
});

describe("translucentOverrides", () => {
  const base = {
    background: "rgb(20, 20, 20)",
    card: "rgb(30, 30, 30)",
    sidebar: "rgb(25, 25, 25)",
  };
  it("paints the backdrop once, clears the main surface and only tints cards and the sidebar", () => {
    const o = translucentOverrides(base, 0.85);
    expect(o.backdrop).toBe("rgba(20, 20, 20, 0.85)");
    expect(o.vars["--background"]).toBe("transparent");
    expect(o.vars["--card"]).toBe("rgba(30, 30, 30, 0.25)");
    expect(o.vars["--sidebar"]).toBe("rgba(25, 25, 25, 0.25)");
  });
  it("never touches popovers, so menus stay readable", () => {
    expect(translucentOverrides(base, 0.85).vars).not.toHaveProperty(
      "--popover",
    );
  });
});

describe("clampWindowOpacity", () => {
  it("keeps 0.4–1 and defaults bad values to 0.5", () => {
    expect(clampWindowOpacity(0.7)).toBe(0.7);
    expect(clampWindowOpacity(0.1)).toBe(0.4);
    expect(clampWindowOpacity(3)).toBe(1);
    expect(clampWindowOpacity("x")).toBe(0.5);
  });
});

describe("terminal translucency follows the saved setting", () => {
  // Terminals are created before the bridge component first runs; deciding
  // from the bridge left them opaque, and a later switch drew "clear" onto an
  // opaque WebGL canvas, i.e. black.
  it("is clear whenever the setting is on, from the start", async () => {
    const { usePreferencesStore } = await import(
      "@/modules/settings/preferences"
    );
    const { terminalBackground, terminalTranslucent } = await import(
      "./translucency"
    );
    usePreferencesStore.setState({ windowTranslucent: true });
    expect(terminalTranslucent()).toBe(true);
    expect(terminalBackground("rgb(20, 20, 20)")).toBe("rgba(0, 0, 0, 0)");
    usePreferencesStore.setState({ windowTranslucent: false });
    expect(terminalTranslucent()).toBe(false);
    expect(terminalBackground("rgb(20, 20, 20)")).toBe("rgb(20, 20, 20)");
  });
});

describe("webglAllowed", () => {
  // xterm's WebGL canvas composites as solid black in WebKit even with a clear
  // background (seen in the runtime report), so see-through terminals use the
  // DOM renderer.
  it("is off while the window is translucent, else follows the setting", async () => {
    const { usePreferencesStore } = await import(
      "@/modules/settings/preferences"
    );
    const { webglAllowed } = await import("./translucency");
    usePreferencesStore.setState({
      windowTranslucent: true,
      terminalWebglEnabled: true,
    });
    expect(webglAllowed()).toBe(false);
    usePreferencesStore.setState({
      windowTranslucent: false,
      terminalWebglEnabled: true,
    });
    expect(webglAllowed()).toBe(true);
    usePreferencesStore.setState({
      windowTranslucent: false,
      terminalWebglEnabled: false,
    });
    expect(webglAllowed()).toBe(false);
  });
});

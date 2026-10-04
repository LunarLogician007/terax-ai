// TEMPORARY (Terax Tiling): a one-off report of what the see-through window
// actually does at runtime, written to /tmp so it can be read without dev
// tools. Remove once translucency works.
import { usePreferencesStore } from "@/modules/settings/preferences";
import { forEachSlot } from "@/modules/terminal/lib/rendererPool";
import { invoke } from "@tauri-apps/api/core";
import { backdropLog } from "./translucency";

const OUT = "/tmp/terax-tiling-translucency.json";

function describe(el: Element): string {
  const cls = (el.getAttribute("class") ?? "")
    .split(/\s+/)
    .slice(0, 4)
    .join(".");
  return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}`;
}

function chain(start: Element | null): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = [];
  for (let el = start; el; el = el.parentElement) {
    const cs = getComputedStyle(el);
    out.push({
      el: describe(el),
      bg: cs.backgroundColor,
      opacity: cs.opacity,
    });
  }
  return out;
}

function canvasAlpha(): Array<Record<string, unknown>> {
  return [...document.querySelectorAll(".xterm canvas")]
    .slice(0, 6)
    .map((c) => {
      const canvas = c as HTMLCanvasElement;
      let attrs: WebGLContextAttributes | null = null;
      try {
        const gl =
          (canvas.getContext("webgl2") as WebGL2RenderingContext | null) ??
          (canvas.getContext("webgl") as WebGLRenderingContext | null);
        attrs = gl?.getContextAttributes() ?? null;
      } catch {}
      return {
        el: describe(canvas),
        bg: getComputedStyle(canvas).backgroundColor,
        webglAlpha: attrs?.alpha ?? "n/a",
        premultiplied: attrs?.premultipliedAlpha ?? "n/a",
      };
    });
}

/** Every element stacked at the centre of `el`, top first, with its paint. */
function stackAt(el: Element | null): Array<Record<string, string>> {
  if (!el) return [];
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  return document.elementsFromPoint(x, y).map((e) => {
    const cs = getComputedStyle(e);
    return {
      el: describe(e),
      bg: cs.backgroundColor,
      bgImage:
        cs.backgroundImage === "none" ? "" : cs.backgroundImage.slice(0, 60),
      opacity: cs.opacity,
    };
  });
}

/** xterm's own resolved theme background (private, read for diagnosis). */
function xtermInternal(): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  forEachSlot((slot) => {
    // biome-ignore lint/suspicious/noExplicitAny: reading xterm internals for a one-off diagnostic.
    const core = (slot.term as any)._core;
    const colors = core?._themeService?.colors;
    out.push({
      background: colors?.background?.css,
      backgroundRgba: colors?.background?.rgba?.toString(16),
    });
  });
  return out;
}

export function scheduleTranslucencyReport(): void {
  const write = async (label: string) => {
    const root = document.documentElement;
    const prefs = usePreferencesStore.getState();
    const slots: Array<Record<string, unknown>> = [];
    forEachSlot((slot) => {
      slots.push({
        leaf: slot.currentLeafId,
        parked: slot.parked,
        allowTransparency: slot.term.options.allowTransparency,
        themeBackground: slot.term.options.theme?.background,
        webgl: !!slot.webglAddon,
      });
    });
    const report = {
      label,
      at: new Date().toISOString(),
      prefs: {
        hydrated: prefs.hydrated,
        windowTranslucent: prefs.windowTranslucent,
        windowOpacity: prefs.windowOpacity,
      },
      root: {
        dataTranslucent: root.dataset.translucent ?? null,
        inlineBackgroundColor: root.style.backgroundColor,
        inlineVars: {
          background: root.style.getPropertyValue("--background"),
          card: root.style.getPropertyValue("--card"),
          sidebar: root.style.getPropertyValue("--sidebar"),
        },
        computedHtmlBg: getComputedStyle(root).backgroundColor,
        computedBodyBg: getComputedStyle(document.body).backgroundColor,
      },
      backdrop: [...backdropLog],
      slots,
      canvases: canvasAlpha(),
      terminalChain: chain(document.querySelector(".xterm-screen")),
      stackAtTerminalCentre: stackAt(document.querySelector(".xterm")),
      xtermInternal: xtermInternal(),
      sidebarChain: chain(document.querySelector(".terax-tui-sidebar")),
    };
    try {
      await invoke("fs_write_file", {
        path: OUT,
        content: JSON.stringify(report, null, 2),
      });
    } catch {}
  };
  window.setTimeout(() => void write("after 4s"), 4000);
}

// Modified for TOSS Terminal (tuios-style tiling), 2026: the AI composer is
// gone; the bar is the Blocks terminal's command input.
import { useBlockController } from "@/modules/terminal/lib/blockController";
import {
  CommandLineIcon,
  Folder01Icon,
  GitBranchIcon,
} from "@hugeicons/core-free-icons";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Chip } from "./Chip";
import { OsIcon } from "./OsIcon";
import { useGitBranch } from "./useGitBranch";
import { useSystemInfo } from "./useSystemInfo";

const ShellInput = lazy(() => import("@/modules/terminal/block/ShellInput"));

type Props = {
  isBlockTab: boolean;
  isTerminalTab: boolean;
  activeLeafId: number | null;
  cwd: string | null;
  home: string | null;
};

export function WorkspaceInputBar({
  isBlockTab,
  isTerminalTab,
  activeLeafId,
  cwd,
  home,
}: Props) {
  const { os, shell } = useSystemInfo();

  const controller = useBlockController(isBlockTab ? activeLeafId : null);
  const blockMode = controller?.blockMode ?? "prompt";

  // Re-resolve the branch chip when a command finishes (covers `git checkout`).
  const [promptNonce, setPromptNonce] = useState(0);
  const prevBlockMode = useRef(blockMode);
  useEffect(() => {
    if (prevBlockMode.current !== "prompt" && blockMode === "prompt") {
      setPromptNonce((n) => n + 1);
    }
    prevBlockMode.current = blockMode;
  }, [blockMode]);
  const branch = useGitBranch(isTerminalTab ? cwd : null, promptNonce);

  if (!isBlockTab) return null;

  return (
    <div data-state="open" className="toss-reveal">
      <div>
        <div className="shrink-0 border-t border-border/60 bg-card/40 px-3 py-2">
          <div className="flex flex-col gap-2 rounded-lg px-1 py-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {os && (
                <Chip tone="neutral" iconNode={<OsIcon os={os} />} title={os} />
              )}
              {cwd && (
                <Chip tone="blue" icon={Folder01Icon} title={cwd}>
                  {relPath(cwd, home)}
                </Chip>
              )}
              {branch && (
                <Chip
                  tone="violet"
                  icon={GitBranchIcon}
                  title={`Branch: ${branch}`}
                >
                  {branch}
                </Chip>
              )}
              {shell && (
                <Chip tone="emerald" icon={CommandLineIcon}>
                  {shell}
                </Chip>
              )}
            </div>
            <div className="relative min-w-0 flex-1">
              {controller && activeLeafId != null && (
                <Suspense fallback={null}>
                  <ShellInput
                    leafId={activeLeafId}
                    mode={blockMode}
                    focused
                    onSubmit={controller.submitCommand}
                    onInterrupt={controller.interrupt}
                    getCwd={controller.getCwd}
                  />
                </Suspense>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function relPath(p: string, home: string | null): string {
  if (!home) return p;
  const h = home.replace(/\/+$/, "");
  if (p === h || p.startsWith(`${h}/`)) return `~${p.slice(h.length)}`;
  return p;
}

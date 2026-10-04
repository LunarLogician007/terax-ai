import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  coerceTilingPrefix,
  setTilingAnimations,
  setTilingDimUnfocused,
  setTilingGap,
  setTilingPrefix,
  setTilingTitleBars,
} from "@/modules/settings/store";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function TilingSection() {
  const prefix = usePreferencesStore((s) => s.tilingPrefix);
  const gap = usePreferencesStore((s) => s.tilingGap);
  const titleBars = usePreferencesStore((s) => s.tilingTitleBars);
  const dim = usePreferencesStore((s) => s.tilingDimUnfocused);
  const animations = usePreferencesStore((s) => s.tilingAnimations);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Tiling"
        description="tuios-style tiling for terminal tabs: panes place themselves, and a prefix key drives them."
      />

      <div className="flex flex-col gap-2">
        <SettingRow
          title="Prefix key"
          description="Press it, then a key: Enter for a new terminal, h/j/k/l to move, ? for the full list."
        >
          <Select
            value={prefix}
            onValueChange={(v) => void setTilingPrefix(coerceTilingPrefix(v))}
          >
            <SelectTrigger className="h-8 w-36 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ctrl+b">Ctrl+B</SelectItem>
              <SelectItem value="ctrl+a">Ctrl+A</SelectItem>
              <SelectItem value="ctrl+space">Ctrl+Space</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          title="Gap"
          description="Space between panes and around the edge."
        >
          <div className="flex w-44 items-center gap-3">
            <Slider
              value={[gap]}
              min={0}
              max={24}
              step={1}
              onValueChange={(v) => void setTilingGap(v[0] ?? 6)}
            />
            <span className="w-9 text-right font-mono text-[11px] text-muted-foreground">
              {gap}px
            </span>
          </div>
        </SettingRow>

        <SettingRow
          title="Title bars"
          description="A thin bar on each pane with its folder and agent state."
        >
          <Switch
            checked={titleBars}
            onCheckedChange={(v) => void setTilingTitleBars(v)}
          />
        </SettingRow>

        <SettingRow
          title="Dim unfocused panes"
          description="Fade panes other than the one you are typing in."
        >
          <Switch
            checked={dim}
            onCheckedChange={(v) => void setTilingDimUnfocused(v)}
          />
        </SettingRow>

        <SettingRow
          title="Animations"
          description="Panes slide and resize when they open, close, swap or zoom. Off when macOS Reduce motion is on."
        >
          <Switch
            checked={animations}
            onCheckedChange={(v) => void setTilingAnimations(v)}
          />
        </SettingRow>
      </div>
    </div>
  );
}

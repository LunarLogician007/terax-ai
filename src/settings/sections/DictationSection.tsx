import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  downloadModel,
  modelReady,
  removeModel,
} from "@/modules/dictation/lib/builtin";
import { coerceModel, MODELS } from "@/modules/dictation/lib/text";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setSttBuiltinModel } from "@/modules/settings/store";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

/**
 * Terax Tiling: local dictation. Whisper runs inside Terax; the model is
 * downloaded once and nothing you say leaves the Mac.
 */
export function DictationSection() {
  const model = usePreferencesStore((s) => s.sttBuiltinModel);
  const [ready, setReady] = useState<boolean | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setReady(null);
    setError(null);
    modelReady(model)
      .then((r) => live && setReady(r))
      .catch(() => live && setReady(false));
    return () => {
      live = false;
    };
  }, [model]);

  const download = async () => {
    setError(null);
    setPct(0);
    try {
      await downloadModel(model, setPct);
      setReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPct(null);
    }
  };

  const remove = async () => {
    setError(null);
    try {
      await removeModel(model);
      setReady(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const status =
    pct !== null
      ? `Downloading… ${pct}%`
      : ready === null
        ? "Checking…"
        : ready
          ? "Ready"
          : "Not downloaded";

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Dictation"
        description='Speak into the terminal. Turn it on with "mic" in the status bar, then press the prefix and Ctrl+Space (or v). Whisper runs inside Terax; nothing you say leaves your Mac.'
      />

      <div className="flex flex-col gap-2">
        <SettingRow
          title="Speech model"
          description="tiny.en is faster; base.en is more accurate. Only the one you pick is downloaded."
        >
          <Select
            value={model}
            disabled={pct !== null}
            onValueChange={(v) => void setSttBuiltinModel(coerceModel(v))}
          >
            <SelectTrigger className="h-8 w-56 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow title="Model file" description={error ?? status}>
          {ready ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-[11px]"
              onClick={() => void remove()}
            >
              Remove
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={pct !== null || ready === null}
              className="h-8 px-2.5 text-[11px]"
              onClick={() => void download()}
            >
              Download
            </Button>
          )}
        </SettingRow>
      </div>
    </div>
  );
}

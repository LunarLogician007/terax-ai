/**
 * The command line as the app can know it: what was typed at the prompt,
 * followed keystroke by keystroke (TOSS Terminal's command suggestions).
 * Anything that changes the line out of sight (Tab completion, history,
 * moving the cursor) makes it unsure until the command ends; an unsure line
 * gets no suggestions rather than wrong ones.
 */

export type LineState = { text: string; certain: boolean };
export const FRESH: LineState = { text: "", certain: true };

export type InputResult = {
  state: LineState;
  /** The line that was run by an Enter in this input, when it was known. */
  submitted?: string;
};

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";

/** Unix word rubout (Ctrl+W): trailing blanks, then the word before them. */
function rubout(text: string): string {
  return text.replace(/\S*\s*$/, "");
}

function dropLast(text: string): string {
  const chars = Array.from(text);
  chars.pop();
  return chars.join("");
}

/**
 * Escape sequences that do nothing when the cursor is already at the end of
 * the line (where it is while the line is known): Right, End.
 */
function harmlessAtEnd(seq: string): boolean {
  return /^\x1b(\[|O)(C|F)$/.test(seq) || /^\x1b\[(3|4|8)~$/.test(seq);
}

/** The length of the escape sequence at the start of `s` (which begins with ESC). */
function escapeLength(s: string): number {
  if (s.length < 2) return 1;
  if (s[1] === "[") {
    let i = 2;
    while (i < s.length && !/[\x40-\x7e]/.test(s[i])) i++;
    return Math.min(i + 1, s.length);
  }
  if (s[1] === "O") return Math.min(3, s.length);
  return 2; // Alt+key
}

export function applyInput(start: LineState, data: string): InputResult {
  let { text, certain } = start;
  let submitted: string | undefined;
  let i = 0;
  while (i < data.length) {
    const rest = data.slice(i);
    if (rest.startsWith(PASTE_START)) {
      const end = rest.indexOf(PASTE_END);
      const inner = rest.slice(
        PASTE_START.length,
        end === -1 ? undefined : end,
      );
      // A pasted newline may run a command: what's left is unknowable.
      if (/[\r\n]/.test(inner)) certain = false;
      else if (certain) text += inner;
      i += end === -1 ? rest.length : end + PASTE_END.length;
      continue;
    }
    const ch = rest[0];
    if (ch === "\x1b") {
      const len = escapeLength(rest);
      if (!harmlessAtEnd(rest.slice(0, len))) certain = false;
      i += len;
      continue;
    }
    i += 1;
    switch (ch) {
      case "\r":
      case "\n":
        if (certain && text.trim()) submitted = text;
        text = "";
        certain = true;
        break;
      case "\x03": // Ctrl+C
        text = "";
        certain = true;
        break;
      case "\x7f":
      case "\b":
        if (certain) text = dropLast(text);
        break;
      case "\x15": // Ctrl+U
        if (certain) text = "";
        break;
      case "\x17": // Ctrl+W
        if (certain) text = rubout(text);
        break;
      case "\x04": // Ctrl+D, Ctrl+E, Ctrl+K, Ctrl+L: nothing at the end
      case "\x05":
      case "\x0b":
      case "\x0c":
        break;
      default:
        if (ch < " ")
          certain = false; // Tab, Ctrl+A, Ctrl+R, …
        else if (certain) text += ch;
    }
  }
  return { state: { text, certain }, submitted };
}

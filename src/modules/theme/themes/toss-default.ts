import type { Theme } from "../types";

export const tossDefault: Theme = {
  id: "toss-default",
  name: "TOSS Terminal Default",
  description: "The default TOSS Terminal look — clean glass over neutral surfaces.",
  editorTheme: { dark: "atomone", light: "atomone" },
  variants: {
    light: {},
    dark: {},
  },
};

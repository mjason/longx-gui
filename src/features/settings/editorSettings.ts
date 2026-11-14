import { Storage, signal } from "nsh";

export const EDITOR_SETTINGS_KEY = "editor.settings.v1";
export const editorDefaults = {
  fontFamily: "monospace",
  fontSize: 13,
  lineHeight: 1.5,
  tabSize: 0,
  softWrap: false,
  lineNumbers: true,
  indentGuides: true,
  activeLine: true,
  showWhitespaces: false,
};
export type EditorPreferences = typeof editorDefaults;
export const editorFonts = [
  { value: "monospace", title: "系统等宽字体" },
  { value: "Menlo", title: "Menlo" },
  { value: "Monaco", title: "Monaco" },
  { value: "Courier New", title: "Courier New" },
];

/** Validate stored data field by field; unknown keys never reach native props. */
export function normalizeEditorPreferences(raw: unknown): EditorPreferences {
  const result = { ...editorDefaults };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
  const value = raw as Record<string, unknown>;
  const number = (key: "fontSize" | "lineHeight", min: number, max: number) => {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate))
      result[key] = Math.min(max, Math.max(min, candidate));
  };
  number("fontSize", 8, 40);
  number("lineHeight", 1.2, 2.4);
  if (editorFonts.some((font) => font.value === value.fontFamily))
    result.fontFamily = value.fontFamily as string;
  if ([0, 2, 4, 8].includes(value.tabSize as number)) result.tabSize = value.tabSize as number;
  for (const key of [
    "softWrap",
    "lineNumbers",
    "indentGuides",
    "activeLine",
    "showWhitespaces",
  ] as const) {
    if (typeof value[key] === "boolean") result[key] = value[key];
  }
  return result;
}

export function createEditorSettings() {
  const current = signal({ ...editorDefaults });
  const status = signal<"loading" | "saved" | "saving" | "error">("loading");
  let changed = false;
  let version = 0;
  let writes: Promise<void> = Promise.resolve();
  function persist() {
    const snapshot = JSON.stringify(current());
    const request = ++version;
    status.set("saving");
    // Serialize writes so a slow earlier change cannot overwrite the latest one.
    writes = writes
      .then(() => Storage.setItem(EDITOR_SETTINGS_KEY, snapshot))
      .then(() => {
        if (request === version) status.set("saved");
      })
      .catch(() => {
        if (request === version) status.set("error");
      });
  }
  void Storage.getItem(EDITOR_SETTINGS_KEY)
    .then((saved) => {
      if (changed) return;
      current.set(saved ? normalizeEditorPreferences(JSON.parse(saved)) : { ...editorDefaults });
      status.set("saved");
    })
    .catch(() => {
      if (!changed) status.set("error");
    });
  return {
    current,
    status,
    update<K extends keyof EditorPreferences>(key: K, value: EditorPreferences[K]) {
      changed = true;
      current.set(normalizeEditorPreferences({ ...current(), [key]: value }));
      persist();
    },
    reset() {
      changed = true;
      current.set({ ...editorDefaults });
      persist();
    },
    retry: persist,
  };
}
export type EditorSettings = ReturnType<typeof createEditorSettings>;

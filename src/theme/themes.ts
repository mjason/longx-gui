import { setColorScheme, setTheme, signal, Storage } from "nsh";

/** Semantic palette: components never need to know which theme is active. */
const light = {
  background: "#fbfbf9", foreground: "#35332f", border: "#dfddd5",
  titlebar: "#e7e6e0", surface: "#f6f5f1", sidebar: "#f3f2ef",
  muted: "#eeede9", "muted-foreground": "#68655d", quiet: "#7c786d",
  primary: "#5e761a", "primary-foreground": "#fbfbf9",
  accent: "#e7ecd9", "accent-foreground": "#35332f", ring: "#5e761a",
  destructive: "#a33e48", purple: "#7752a8", teal: "#1e7686", ochre: "#936312", overlay: "#000000",
};
type Palette = typeof light;
export interface AppTheme {
  id: string;
  name: string;
  appearance: "light" | "dark";
  colors: Palette;
}
export const themes: readonly AppTheme[] = [
  { id: "light", name: "浅色", appearance: "light", colors: light },
  { id: "dark", name: "深色", appearance: "dark", colors: {
    background: "#272822", foreground: "#f8f8f2", border: "#3e4136",
    titlebar: "#1c1d18", surface: "#22241e", sidebar: "#20211c",
    muted: "#303229", "muted-foreground": "#c2c5b4", quiet: "#969b87",
    primary: "#a6e22e", "primary-foreground": "#20211c",
    accent: "#3d4929", "accent-foreground": "#f8f8f2", ring: "#a6e22e",
    destructive: "#f27794", purple: "#ae81ff", teal: "#66d9ef", ochre: "#e6db74", overlay: "#000000",
  } },
];
export const THEME_STORAGE_KEY = "appearance.theme";

function apply(theme: AppTheme) {
  const c = theme.colors;
  const colors = { ...c,
    input: c.border, secondary: c.muted, "secondary-foreground": c.foreground,
    card: c.surface, "card-foreground": c.foreground,
    popover: c.surface, "popover-foreground": c.foreground,
    "sidebar-foreground": c.foreground,
    "sidebar-primary": c.primary, "sidebar-primary-foreground": c["primary-foreground"],
    "sidebar-accent": c.accent, "sidebar-accent-foreground": c.foreground,
    "sidebar-border": c.border, "sidebar-ring": c.ring,
  };
  setTheme({ cssVars: { theme: {
    "font-sans": "system-ui, -apple-system, 'PingFang SC', 'Segoe UI', sans-serif",
  }, light: colors, dark: colors } });
  setColorScheme(theme.appearance);
}

/** Preference only; switching never recreates the window's workspace model. */
export function createThemeState() {
  const current = signal(themes[0]);
  const persistenceError = signal(false);
  let changed = false;
  apply(current());
  void Storage.getItem(THEME_STORAGE_KEY).then(id => {
    if (changed) return;
    // Preserve preferences saved before the display-name cleanup.
    const savedId = id === "monokai-light" ? "light" : id === "monokai-dark" ? "dark" : id;
    const saved = themes.find(theme => theme.id === savedId);
    if (saved) { apply(saved); current.set(saved); }
  }).catch(() => persistenceError.set(true));
  return { current, persistenceError, select(id: string) {
    const theme = themes.find(candidate => candidate.id === id);
    if (!theme) return;
    changed = true;
    apply(theme);
    current.set(theme);
    void Storage.setItem(THEME_STORAGE_KEY, id)
      .then(() => persistenceError.set(false))
      .catch(() => persistenceError.set(true));
  } };
}
export type ThemeState = ReturnType<typeof createThemeState>;

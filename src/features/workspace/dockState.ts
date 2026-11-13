import { signal } from "nsh";
import type { Panel } from "./PanelBar";

export function createDockState() {
  const files = signal(true);
  const chats = signal(true);
  const auxiliary = signal<"branch" | "bot" | null>(null);
  const visible = () => files() || chats() || auxiliary() !== null;
  function close() { files.set(false); chats.set(false); auxiliary.set(null); }
  return {
    files, chats, auxiliary, visible, close,
    selected: (panel: Panel) => panel === "folder" ? files() && !auxiliary()
      : panel === "chat" ? chats() : auxiliary() === panel,
    toggle(panel: Panel) {
      if (panel === "folder") {
        if (auxiliary()) { auxiliary.set(null); files.set(true); }
        else files.set(!files());
      } else if (panel === "chat") chats.set(!chats());
      else auxiliary.set(auxiliary() === panel ? null : panel);
    },
    toggleSidebar() {
      if (visible()) close();
      else { files.set(true); chats.set(true); }
    },
  };
}
export type DockState = ReturnType<typeof createDockState>;

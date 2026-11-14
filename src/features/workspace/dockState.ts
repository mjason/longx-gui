import { signal } from "nsh";
import type { Panel } from "./PanelBar";

export function createDockState() {
  const files = signal(true);
  const chats = signal(true);
  const auxiliary = signal<"branch" | "bot" | null>(null);
  const open = signal(true);
  const visible = () => open() && (files() || chats() || auxiliary() !== null);
  function close() {
    open.set(false);
  }
  return {
    files,
    chats,
    auxiliary,
    open,
    visible,
    close,
    selected: (panel: Panel) =>
      visible() &&
      (panel === "folder"
        ? files() && !auxiliary()
        : panel === "chat"
          ? chats() && auxiliary() !== "branch"
          : auxiliary() === panel),
    toggle(panel: Panel) {
      if (!open()) {
        open.set(true);
        if (panel === "folder") {
          files.set(true);
          auxiliary.set(null);
        } else if (panel === "chat") {
          chats.set(true);
          if (auxiliary() === "branch") auxiliary.set(null);
        } else auxiliary.set(panel);
        return;
      }
      if (panel === "folder") {
        if (auxiliary()) {
          auxiliary.set(null);
          files.set(true);
        } else files.set(!files());
      } else if (panel === "chat") {
        if (auxiliary() === "branch") {
          auxiliary.set(null);
          chats.set(true);
        } else chats.set(!chats());
      } else auxiliary.set(auxiliary() === panel ? null : panel);
    },
    toggleSidebar() {
      if (visible()) close();
      else {
        open.set(true);
        if (!files() && !chats() && !auxiliary()) {
          files.set(true);
          chats.set(true);
        }
      }
    },
  };
}
export type DockState = ReturnType<typeof createDockState>;

import { Menu } from "nsh/desktop";

/** Keep standard native editing/window roles when adding our Settings entry. */
export function installApplicationMenu(openSettings: () => void, openUpdates?: () => void) {
  Menu.setApplicationMenu([
    {
      label: "Longx GUI",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: "Settings…", shortcut: "mod+,", onSelect: openSettings },
        ...(openUpdates ? [{ label: "检查更新…", onSelect: openUpdates }] : []),
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "showAll" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "窗口",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { role: "toggleFullScreen" },
        { role: "close" },
      ],
    },
  ]);
}

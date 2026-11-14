import { signal } from "nsh";
import type { FileEntry, ThreadSummary } from "../../api/client";

/** Git can open a path before its directory metadata has been loaded. */
type EditorFile = Pick<FileEntry, "name" | "path"> & Partial<FileEntry>;

export type ContentTab =
  | { id: "chat:new"; kind: "new"; title: string }
  | { id: string; kind: "file"; title: string; file: EditorFile }
  | { id: string; kind: "diff"; title: string; path: string }
  | { id: string; kind: "chat"; title: string; thread: ThreadSummary };

export function createContentTabs() {
  const items = signal<ContentTab[]>([]);
  const active = signal<string | null>(null);
  const selectionRequest = signal<{ id: string; version: number } | null>(null);
  let version = 0;
  function open(tab: ContentTab) {
    if (!items().some((item) => item.id === tab.id)) items.set([...items(), tab]);
    active.set(tab.id);
    selectionRequest.set({ id: tab.id, version: ++version });
  }
  return {
    items,
    active,
    selectionRequest,
    current: () => items().find((item) => item.id === active()),
    select: (id: string) => {
      if (items().some((item) => item.id === id)) active.set(id);
    },
    openFile: (file: EditorFile) =>
      open({ id: `file:${file.path}`, kind: "file", title: file.name, file }),
    openDiff: (path: string) =>
      open({ id: `diff:${path}`, kind: "diff", title: `${path.split("/").pop()} · 差异`, path }),
    openThread: (thread: ThreadSummary) =>
      open({ id: `chat:${thread.id}`, kind: "chat", title: thread.title || "未命名会话", thread }),
    openNewThread: () => open({ id: "chat:new", kind: "new", title: "新会话" }),
    close(id: string) {
      const index = items().findIndex((item) => item.id === id);
      if (index < 0) return;
      const remaining = items().filter((item) => item.id !== id);
      items.set(remaining);
      if (active() === id) active.set(remaining[index]?.id ?? remaining[index - 1]?.id ?? null);
    },
    reset() {
      items.set([]);
      active.set(null);
      selectionRequest.set(null);
    },
  };
}
export type ContentTabsState = ReturnType<typeof createContentTabs>;

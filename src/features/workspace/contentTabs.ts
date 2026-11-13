import { signal } from "nsh";
import type { FileEntry, ThreadSummary } from "../../api/client";

export type ContentTab =
  | { id: string; kind: "file"; title: string; file: FileEntry }
  | { id: string; kind: "chat"; title: string; thread: ThreadSummary };

export function createContentTabs() {
  const items = signal<ContentTab[]>([]);
  const active = signal<string | null>(null);
  function open(tab: ContentTab) {
    if (!items().some(item => item.id === tab.id)) items.set([...items(), tab]);
    active.set(tab.id);
  }
  return {
    items, active,
    current: () => items().find(item => item.id === active()),
    select: (id: string) => { if (items().some(item => item.id === id)) active.set(id); },
    openFile: (file: FileEntry) => open({ id: `file:${file.path}`, kind: "file", title: file.name, file }),
    openThread: (thread: ThreadSummary) => open({ id: `chat:${thread.id}`, kind: "chat", title: thread.title || "未命名会话", thread }),
    close(id: string) {
      const index = items().findIndex(item => item.id === id);
      if (index < 0) return;
      const remaining = items().filter(item => item.id !== id);
      items.set(remaining);
      if (active() === id) active.set(remaining[index]?.id ?? remaining[index - 1]?.id ?? null);
    },
    reset() { items.set([]); active.set(null); },
  };
}
export type ContentTabsState = ReturnType<typeof createContentTabs>;

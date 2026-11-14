import { Clipboard, type Point, signal } from "nsh";
import { Menu, type MenuItem } from "nsh/desktop";
import { type FileEntry, listFiles, type ThreadSummary } from "../../api/client";
import { OperationError } from "../../api/session";
import { changeEntry, changeThread, entryPath } from "../../api/sidebar";
import type { WorkspaceState } from "../../state/workspace";
import type { EditorState } from "../files/editorState";
import type { FileTreeState } from "../files/treeState";
import type { ContentTabsState } from "./contentTabs";

type Action =
  | "file"
  | "folder"
  | "rename-entry"
  | "delete-entry"
  | "rename-thread"
  | "archive-thread"
  | "delete-thread";
interface Target {
  action: Action;
  url: string;
  projectId: string;
  root: string;
  entry?: FileEntry;
  thread?: ThreadSummary;
}
export function createSidebarActions(options: {
  workspace: WorkspaceState;
  tree: FileTreeState;
  tabs: ContentTabsState;
  editor: EditorState;
  refreshGit: () => void;
  filesBusy: () => boolean;
}) {
  const target = signal<Target | null>(null),
    value = signal(""),
    error = signal(""),
    busy = signal(false),
    uncertain = signal(false);
  const state = options.workspace;
  const scope = () => ({
    url: state.currentServer()?.url ?? "",
    projectId: state.selectedProject()?.id ?? "",
    root: state.selectedProject()?.rootPath ?? "",
  });
  const current = (item: Target) =>
    scope().url === item.url && scope().projectId === item.projectId;
  function open(item: Target) {
    if (busy() || !current(item)) return;
    target.set(item);
    value.set(
      item.action === "rename-thread"
        ? (item.thread?.title ?? "")
        : item.action === "rename-entry"
          ? (item.entry?.path ?? "")
          : "",
    );
    error.set("");
    uncertain.set(false);
  }
  function close() {
    if (!busy()) target.set(null);
  }
  async function copy(text: string) {
    try {
      await Clipboard.writeText(text);
    } catch {
      error.set("未能复制到剪贴板。");
    }
  }
  async function submit() {
    const item = target();
    if (!item || busy() || uncertain()) return;
    if (!current(item)) {
      error.set("工作区已切换，请关闭并在目标项目中重新操作。");
      return;
    }
    const text = value().trim();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let unlock: (() => void) | undefined;
    busy.set(true);
    error.set("");
    try {
      if (item.thread) {
        const operation =
          item.action === "rename-thread"
            ? "rename"
            : item.action === "archive-thread"
              ? "archive"
              : "delete";
        if (operation === "rename" && !text) throw new Error("会话名称不能为空。");
        const result = await changeThread(
          item.url,
          item.thread.id,
          operation,
          text,
          controller.signal,
        );
        if (current(item)) {
          state.workspaceData.update((data) => ({
            ...data,
            threads: result
              ? data.threads.map((thread) => (thread.id === result.id ? result : thread))
              : data.threads.filter((thread) => thread.id !== item.thread!.id),
          }));
          if (result) {
            options.tabs.items.update((tabs) =>
              tabs.map((tab) =>
                tab.kind === "chat" && tab.thread.id === result.id
                  ? { ...tab, title: result.title || "未命名会话", thread: result }
                  : tab,
              ),
            );
          }
          // Remount archived conversations against authoritative server state.
          if (operation !== "rename") options.tabs.close(`chat:${item.thread.id}`);
        }
      } else {
        if (options.filesBusy()) throw new Error("Git 操作正在进行，请等待完成后再修改文件路径。");
        const creating = item.action === "file" || item.action === "folder";
        const parent =
          item.entry?.kind === "dir"
            ? item.entry.path
            : (item.entry?.path.split("/").slice(0, -1).join("/") ?? "");
        const path = creating
          ? entryPath([parent, text].filter(Boolean).join("/"))
          : entryPath(item.entry!.path);
        const destination = item.action === "rename-entry" ? entryPath(text) : path;
        if (creating && (!text || text.includes("/") || text.includes("\\")))
          throw new Error("请输入单个文件或文件夹名称，不要包含路径分隔符。");
        if (item.action === "rename-entry" && destination === path)
          throw new Error("路径没有变化。");
        if (!creating) unlock = options.editor.lockPath(item.url, item.projectId, path);
        if (item.action !== "delete-entry") {
          const directory = destination.split("/").slice(0, -1).join("/");
          const entries = await listFiles(item.url, item.projectId, directory, controller.signal);
          if (entries.some((entry) => entry.path === destination))
            throw new Error("目标已存在，未覆盖已有文件或目录。");
        }
        // Read-only preflight may outlive a project switch. Never start a write then.
        if (!current(item)) throw new Error("工作区已切换，未执行文件操作。");
        const result = await changeEntry(
          item.url,
          item.projectId,
          creating ? "create" : item.action === "rename-entry" ? "rename" : "delete",
          path,
          destination,
          item.action === "folder" ? "dir" : "file",
          controller.signal,
        );
        if (!creating) options.editor.invalidatePath(item.url, item.projectId, path);
        if (current(item)) {
          if (!creating) {
            for (const tab of options.tabs.items()) {
              const file =
                tab.kind === "file" ? tab.file.path : tab.kind === "diff" ? tab.path : "";
              if (file === path || file.startsWith(`${path}/`)) options.tabs.close(tab.id);
            }
          }
          await options.tree.refreshPaths([path, destination]);
          if (current(item)) {
            options.refreshGit();
            if (result?.kind === "file") options.tabs.openFile(result);
          }
        }
      }
      if (target() === item) target.set(null);
    } catch (failure) {
      if (target() === item) {
        error.set(failure instanceof Error ? failure.message : "操作失败。");
        uncertain.set(failure instanceof OperationError && !failure.rejected);
      }
    } finally {
      unlock?.();
      clearTimeout(timeout);
      busy.set(false);
    }
  }
  function fileMenu(entry: FileEntry | undefined, at: Point) {
    const captured = { ...scope(), entry };
    if (!captured.projectId || busy()) return;
    const items: MenuItem[] = [
      ...(entry?.kind !== "dir" && entry
        ? [
            {
              label: "打开",
              onSelect: () => {
                if (current({ ...captured, action: "file" })) options.tabs.openFile(entry);
              },
            },
          ]
        : []),
      { label: "新建文件…", onSelect: () => open({ ...captured, action: "file" }) },
      { label: "新建文件夹…", onSelect: () => open({ ...captured, action: "folder" }) },
      { type: "separator" },
      { label: "复制相对路径", disabled: !entry, onSelect: () => void copy(entry?.path ?? "") },
      {
        label: "复制绝对路径",
        onSelect: () =>
          void copy([captured.root.replace(/\/$/, ""), entry?.path].filter(Boolean).join("/")),
      },
      ...(entry
        ? [
            { type: "separator" as const },
            {
              label: "重命名／移动…",
              onSelect: () => open({ ...captured, action: "rename-entry" }),
            },
            { label: "删除…", onSelect: () => open({ ...captured, action: "delete-entry" }) },
          ]
        : []),
      { type: "separator" },
      {
        label: "刷新目录",
        onSelect: () => {
          if (current({ ...captured, action: "file" })) void options.tree.refreshPaths();
        },
      },
      {
        label: "全部折叠",
        onSelect: () => {
          if (current({ ...captured, action: "file" })) options.tree.expanded.set([]);
        },
      },
    ];
    void Menu.popup(items, at).catch(() => error.set("无法打开右键菜单。"));
  }
  function threadMenu(thread: ThreadSummary, at: Point) {
    const captured = { ...scope(), thread };
    if (!captured.projectId || busy()) return;
    void Menu.popup(
      [
        {
          label: "打开会话",
          onSelect: () => {
            if (current({ ...captured, action: "rename-thread" })) options.tabs.openThread(thread);
          },
        },
        { label: "重命名…", onSelect: () => open({ ...captured, action: "rename-thread" }) },
        { label: "复制会话 ID", onSelect: () => void copy(thread.id) },
        { type: "separator" },
        {
          label: "归档…",
          disabled: thread.status === "archived",
          onSelect: () => open({ ...captured, action: "archive-thread" }),
        },
        { label: "删除会话…", onSelect: () => open({ ...captured, action: "delete-thread" }) },
      ],
      at,
    ).catch(() => error.set("无法打开右键菜单。"));
  }
  return { target, value, error, busy, uncertain, close, submit, fileMenu, threadMenu };
}
export type SidebarActions = ReturnType<typeof createSidebarActions>;

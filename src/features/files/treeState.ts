import { type Accessor, computed, effect, signal, untracked } from "nsh";
import type { TreeItem } from "nsh/base";
import { type FileEntry, listFiles } from "../../api/client";

interface Directory {
  status: "loading" | "ready" | "error";
  entries: FileEntry[];
}

interface FileTreeOptions {
  serverUrl: Accessor<string | undefined>;
  projectId: Accessor<string | undefined>;
  entries: Accessor<FileEntry[]>;
  search: Accessor<string>;
}

/** Expansion cache is local to this tree, invalidated on root/project changes. */
export function createFileTreeState(options: FileTreeOptions) {
  const directories = signal<Record<string, Directory>>({});
  const expanded = signal<string[]>([]);
  const selected = signal<string | null>(null);
  const root = signal<FileEntry[] | null>(null);
  const roots = () => root() ?? options.entries();
  const requests = new Map<string, AbortController>();
  let generation = 0;
  function cancel() {
    generation++;
    for (const controller of requests.values()) controller.abort();
    requests.clear();
  }
  effect(() => {
    options.serverUrl();
    options.projectId();
    options.entries();
    untracked(() => {
      cancel();
      directories.set({});
      root.set(null);
      expanded.set([]);
      selected.set(null);
    });
    return cancel;
  });

  function entry(id: string): FileEntry | undefined {
    if (!id.startsWith("entry:")) return undefined;
    const path = id.slice(6);
    return (
      roots().find((file) => file.path === path) ??
      Object.values(directories())
        .flatMap((directory) => directory.entries)
        .find((file) => file.path === path)
    );
  }

  async function expand(id: string) {
    const file = entry(id);
    const serverUrl = options.serverUrl();
    const projectId = options.projectId();
    if (file?.kind !== "dir" || !serverUrl || !projectId) return;
    const cached = directories()[file.path];
    if (cached?.status === "ready" || cached?.status === "loading") return;
    const controller = new AbortController();
    const version = generation;
    requests.set(file.path, controller);
    const timeout = setTimeout(() => controller.abort(), 10000);
    directories.update((values) => ({
      ...values,
      [file.path]: { status: "loading", entries: [] },
    }));
    try {
      const entries = await listFiles(serverUrl, projectId, file.path, controller.signal);
      if (version === generation && requests.get(file.path) === controller) {
        directories.update((values) => ({ ...values, [file.path]: { status: "ready", entries } }));
      }
    } catch {
      if (version === generation && requests.get(file.path) === controller) {
        directories.update((values) => ({
          ...values,
          [file.path]: { status: "error", entries: [] },
        }));
      }
    } finally {
      clearTimeout(timeout);
      if (requests.get(file.path) === controller) requests.delete(file.path);
    }
  }

  const items = computed(() => {
    const cache = directories();
    const search = options.search().trim().toLowerCase();
    function build(entries: FileEntry[]): TreeItem[] {
      return entries.flatMap((file) => {
        const directory = cache[file.path];
        const children = file.kind === "dir" ? build(directory?.entries ?? []) : undefined;
        if (search && !file.name.toLowerCase().includes(search) && !children?.length) return [];
        return [
          {
            id: `entry:${file.path}`,
            label: file.name,
            ...(children
              ? {
                  children: children.length
                    ? children
                    : [
                        {
                          id: `status:${file.path}`,
                          disabled: true,
                          label:
                            directory?.status === "error"
                              ? "读取失败，收起后展开重试"
                              : directory?.status === "ready"
                                ? "空文件夹"
                                : "正在读取…",
                        },
                      ],
                }
              : {}),
          },
        ];
      });
    }
    return build(roots());
  });

  return {
    items,
    expanded,
    selected,
    entry,
    expand,
    async refreshPaths(paths?: string[]) {
      const serverUrl = options.serverUrl(),
        projectId = options.projectId();
      if (!serverUrl || !projectId) return;
      const version = generation;
      // Refresh loaded listings only. Expansion, selection, drafts and unopened folders survive.
      const targets = ["", ...Object.keys(directories())].filter(
        (directory) =>
          !paths?.length ||
          directory === "" ||
          paths.some(
            (path) =>
              path === directory ||
              path.startsWith(`${directory}/`) ||
              directory.startsWith(`${path.replace(/\/$/, "")}/`),
          ),
      );
      await Promise.all(
        targets.map(async (path) => {
          requests.get(path)?.abort();
          const controller = new AbortController();
          requests.set(path, controller);
          const timeout = setTimeout(() => controller.abort(), 10000);
          try {
            const entries = await listFiles(serverUrl, projectId, path, controller.signal);
            if (version !== generation || requests.get(path) !== controller) return;
            if (path === "") root.set(entries);
            else
              directories.update((values) => ({ ...values, [path]: { status: "ready", entries } }));
          } catch {
            /* Keep the last successful listing; later events/reconnect retry it. */
          } finally {
            clearTimeout(timeout);
            if (requests.get(path) === controller) requests.delete(path);
          }
        }),
      );
    },
    filter: options.search,
    visibleExpanded: () => {
      if (!options.search().trim()) return expanded();
      const parents: string[] = [];
      function visit(items: TreeItem[]) {
        for (const item of items) {
          if (item.children?.some((child) => !child.disabled)) {
            parents.push(item.id);
            visit(item.children);
          }
        }
      }
      visit(items());
      return [...new Set([...expanded(), ...parents])];
    },
  };
}

export type FileTreeState = ReturnType<typeof createFileTreeState>;

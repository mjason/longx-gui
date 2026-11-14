import { effect, lifecycle, signal, untracked } from "nsh";
import {
  type GitLog,
  type GitStatus,
  gitCommit,
  gitHistory,
  gitIgnoredPaths,
  gitStatus,
} from "../../api/git";
import { subscribeProject } from "../../api/projectPush";
import { OperationError } from "../../api/session";

export type DiffLayout = "split" | "unified";

export function createGitState(options: {
  url: () => string | undefined;
  projectId: () => string | undefined;
  enabled: () => boolean;
  dirty: (path: string) => boolean;
  onFiles?: (paths: string[] | undefined) => void;
  subscribe?: typeof subscribeProject;
}) {
  const status = signal<GitStatus | null>(null);
  const ignored = signal<string[]>([]);
  const history = signal<GitLog[]>([]);
  const selected = signal<string[]>([]);
  const loading = signal(false);
  const busy = signal(false);
  const error = signal("");
  const result = signal("");
  const revision = signal(0);
  const diffLayout = signal<DiffLayout>("split");
  const pushConnected = signal(false);
  const fileRevisions = signal<Record<string, number>>({});
  let generation = 0;
  let controller: AbortController | undefined;
  let disposed = false;
  let scope = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let signature = "";
  let ignoredReady = false;
  let ignoredVersion = 0;
  let historyHead: string | null | undefined;
  let pending = false;
  let notification: ReturnType<typeof setTimeout> | undefined;
  function schedule() {
    clearTimeout(timer);
    if (
      !disposed &&
      (!pushConnected() || failures > 0) &&
      lifecycle() !== "background" &&
      options.enabled() &&
      options.url() &&
      options.projectId()
    )
      timer = setTimeout(() => void refresh(false), Math.min(3000 * 2 ** failures, 30000));
  }
  // Quiet checks never interrupt an in-flight read or invalidate an unchanged diff.
  async function refresh(force = true) {
    if (disposed) return;
    if (!force && controller) {
      pending = true;
      return;
    }
    pending = false;
    clearTimeout(timer);
    const url = options.url(),
      projectId = options.projectId();
    const run = ++generation;
    controller?.abort();
    if (!url || !projectId || !options.enabled()) {
      loading.set(false);
      return;
    }
    const request = new AbortController();
    const ignoredRun = ignoredVersion;
    controller = request;
    const timeout = setTimeout(() => request.abort(), 15000);
    if (force) {
      loading.set(true);
      error.set("");
    }
    try {
      const value = await gitStatus(url, projectId, request.signal);
      if (disposed || generation !== run) return;
      const nextSignature = JSON.stringify({
        ...value,
        changes: [...value.changes].sort((a, b) => a.path.localeCompare(b.path)),
      });
      const changed = nextSignature !== signature;
      const readHistory = force || historyHead !== value.head;
      const log = readHistory
        ? value.repository
          ? await gitHistory(url, projectId, request.signal)
          : []
        : null;
      const paths =
        value.repository && (force || changed || !ignoredReady)
          ? await gitIgnoredPaths(url, projectId, request.signal).catch(() => null)
          : null;
      if (disposed || generation !== run) return;
      failures = 0;
      error.set("");
      if (changed || force) {
        status.set(value);
        signature = nextSignature;
        revision.set(revision() + 1);
        selected.set(
          selected().filter((path) => value.changes.some((change) => change.path === path)),
        );
      }
      if (log) {
        history.set(log);
        historyHead = value.head;
      }
      if (!value.repository) ignored.set([]);
      else if (paths) {
        ignoredReady = ignoredRun === ignoredVersion;
        if (JSON.stringify(paths) !== JSON.stringify(ignored())) ignored.set(paths);
      } else if (force || changed) ignoredReady = false;
    } catch {
      if (!disposed && generation === run) {
        failures++;
        error.set("无法读取 Git，请检查服务状态后刷新。");
      }
    } finally {
      clearTimeout(timeout);
      if (!disposed && generation === run) {
        controller = undefined;
        loading.set(false);
        if (pending) void refresh(false);
        else schedule();
      }
    }
  }
  effect(() => {
    const next = JSON.stringify([options.url(), options.projectId()]);
    const enabled = options.enabled();
    untracked(() => {
      if (next !== scope) {
        scope = next;
        signature = "";
        ignoredReady = false;
        historyHead = undefined;
        failures = 0;
        pending = false;
        fileRevisions.set({});
        status.set(null);
        ignored.set([]);
        history.set([]);
        selected.set([]);
        error.set("");
      }
      if (enabled) void refresh();
      else {
        ++generation;
        controller?.abort();
        controller = undefined;
        clearTimeout(timer);
        loading.set(false);
      }
    });
  });
  effect(() => {
    const url = options.url(),
      projectId = options.projectId(),
      enabled = options.enabled();
    if (!url || !projectId || !enabled) return;
    let active = true;
    let allFiles = false;
    const changedFiles = new Set<string>();
    const notify = (paths?: string[] | null) => {
      if (paths === undefined || (paths !== null && (!paths.length || paths.includes(""))))
        allFiles = true;
      else if (paths) for (const path of paths) changedFiles.add(path);
      clearTimeout(notification);
      notification = setTimeout(() => {
        if (!active) return;
        if (allFiles) {
          revision.set(revision() + 1);
          options.onFiles?.(undefined);
        } else if (changedFiles.size) {
          const paths = [...changedFiles];
          fileRevisions.update((values) => {
            const next = { ...values };
            for (const path of paths) next[path] = (next[path] ?? 0) + 1;
            return next;
          });
          options.onFiles?.(paths);
        }
        allFiles = false;
        changedFiles.clear();
        void refresh(false);
      }, 100);
    };
    const stop = untracked(() =>
      (options.subscribe ?? subscribeProject)({
        url,
        projectId,
        ready: (connected) => {
          if (!active) return;
          const wasConnected = pushConnected();
          pushConnected.set(connected);
          if (connected) clearTimeout(timer);
          else if (wasConnected) schedule();
        },
        joined: (reconnected) => {
          if (!active) return;
          ignoredReady = false;
          ignoredVersion++;
          if (!reconnected) options.onFiles?.(undefined);
          notify(reconnected ? undefined : null);
        },
        git: () => {
          if (!active) return;
          ignoredReady = false;
          ignoredVersion++;
          notify(null);
        },
        files: (paths) => {
          if (!active) return;
          ignoredReady = false;
          ignoredVersion++;
          notify(paths);
        },
      }),
    );
    return () => {
      active = false;
      clearTimeout(notification);
      stop();
      pushConnected.set(false);
    };
  });
  effect(() => {
    const visible = lifecycle() !== "background";
    untracked(() => {
      if (visible && !controller) void refresh(false);
      else clearTimeout(timer);
    });
  });
  effect(() => () => {
    disposed = true;
    ++generation;
    controller?.abort();
    clearTimeout(timer);
    clearTimeout(notification);
  });
  function eligible(path: string) {
    const change = status()?.changes.find((change) => change.path === path);
    return !!change && !["renamed", "copied", "unmerged"].includes(change.status);
  }
  function selectable() {
    return (
      status()
        ?.changes.filter((change) => !["renamed", "copied", "unmerged"].includes(change.status))
        .map((change) => change.path) ?? []
    );
  }
  return {
    status,
    ignored,
    history,
    selected,
    loading,
    busy,
    error,
    result,
    revision,
    pushConnected,
    fileRevision: (path: string) =>
      Object.entries(fileRevisions()).reduce(
        (sum, [changed, value]) =>
          sum + (path === changed || path.startsWith(`${changed.replace(/\/$/, "")}/`) ? value : 0),
        0,
      ),
    diffLayout,
    setDiffLayout: (value: DiffLayout) => diffLayout.set(value),
    refresh,
    eligible,
    selectable,
    selectAll() {
      if (busy() || loading() || status()?.merging) return;
      const paths = selectable();
      const chosen = new Set(selected());
      selected.set(paths.length > 0 && paths.every((path) => chosen.has(path)) ? [] : paths);
    },
    toggle(path: string) {
      if (busy() || !eligible(path)) return;
      selected.set(
        selected().includes(path)
          ? selected().filter((item) => item !== path)
          : [...selected(), path],
      );
    },
    canCommit: () =>
      !busy() &&
      !loading() &&
      !!status()?.repository &&
      !status()?.merging &&
      selected().length > 0 &&
      selected().every((path) => eligible(path) && !options.dirty(path)),
    async commit(message: string) {
      const url = options.url(),
        projectId = options.projectId();
      if (
        !url ||
        !projectId ||
        !message.trim() ||
        busy() ||
        !selected().length ||
        status()?.merging ||
        selected().some((path) => !eligible(path) || options.dirty(path))
      )
        return;
      const paths = [...selected()];
      busy.set(true);
      result.set("");
      error.set("");
      const request = new AbortController();
      const timeout = setTimeout(() => request.abort(), 90000);
      try {
        const latest = await gitStatus(url, projectId, request.signal);
        if (latest.merging || !latest.repository)
          throw new OperationError("仓库状态已改变，未提交。");
        if (
          !paths.every((path) =>
            latest.changes.some(
              (change) =>
                change.path === path && !["renamed", "copied", "unmerged"].includes(change.status),
            ),
          )
        )
          throw new OperationError("所选变更已改变，请刷新后重新选择。");
        const sha = await gitCommit(url, projectId, paths, message, request.signal);
        if (!disposed) {
          result.set(`项目 ${projectId} 已提交 ${sha.slice(0, 8)}（未推送）`);
          if (options.url() === url && options.projectId() === projectId) selected.set([]);
        }
        return true;
      } catch (failure) {
        if (!disposed)
          result.set(
            failure instanceof OperationError
              ? failure.message
              : "提交结果未确认，请检查历史；不会自动重试。",
          );
      } finally {
        clearTimeout(timeout);
        if (!disposed) {
          busy.set(false);
          void refresh();
        }
      }
    },
  };
}
export type GitState = ReturnType<typeof createGitState>;

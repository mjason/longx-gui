import { effect, signal } from "nsh";
import { gitCommit, gitHistory, gitStatus, type GitLog, type GitStatus } from "../../api/git";
import { OperationError } from "../../api/session";

export function createGitState(options: {
  url: () => string | undefined; projectId: () => string | undefined; enabled: () => boolean;
  dirty: (path: string) => boolean;
}) {
  const status = signal<GitStatus | null>(null);
  const history = signal<GitLog[]>([]);
  const selected = signal<string[]>([]);
  const loading = signal(false);
  const busy = signal(false);
  const error = signal("");
  const result = signal("");
  const revision = signal(0);
  let generation = 0;
  let controller: AbortController | undefined;
  let disposed = false;
  let scope = "";
  async function refresh() {
    const url = options.url(), projectId = options.projectId();
    const run = ++generation;
    controller?.abort();
    if (!url || !projectId || !options.enabled()) { loading.set(false); return; }
    const request = new AbortController();
    controller = request;
    const timeout = setTimeout(() => request.abort(), 15000);
    loading.set(true); error.set("");
    try {
      const value = await gitStatus(url, projectId, request.signal);
      const log = value.repository ? await gitHistory(url, projectId, request.signal) : [];
      if (disposed || generation !== run) return;
      status.set(value); history.set(log);
      revision.set(revision() + 1);
      selected.set(selected().filter(path => value.changes.some(change => change.path === path)));
    } catch {
      if (!disposed && generation === run) { status.set(null); error.set("无法读取 Git，请检查服务状态后刷新。"); }
    } finally {
      clearTimeout(timeout);
      if (!disposed && generation === run) loading.set(false);
    }
  }
  effect(() => {
    const next = JSON.stringify([options.url(), options.projectId()]);
    options.enabled();
    if (next !== scope) { scope = next; status.set(null); history.set([]); selected.set([]); error.set(""); }
    void refresh();
  });
  effect(() => () => { disposed = true; ++generation; controller?.abort(); });
  function eligible(path: string) {
    const change = status()?.changes.find(change => change.path === path);
    return !!change && !["renamed", "copied", "unmerged"].includes(change.status);
  }
  return {
    status, history, selected, loading, busy, error, result, revision, refresh, eligible,
    toggle(path: string) {
      if (busy() || !eligible(path)) return;
      selected.set(selected().includes(path) ? selected().filter(item => item !== path) : [...selected(), path]);
    },
    canCommit: () => !busy() && !loading() && !!status()?.repository && !status()?.merging &&
      selected().length > 0 && selected().every(path => eligible(path) && !options.dirty(path)),
    async commit(message: string) {
      const url = options.url(), projectId = options.projectId();
      if (!url || !projectId || !message.trim() || busy() || !selected().length || status()?.merging ||
        selected().some(path => !eligible(path) || options.dirty(path))) return;
      const paths = [...selected()];
      busy.set(true); result.set(""); error.set("");
      const request = new AbortController();
      const timeout = setTimeout(() => request.abort(), 90000);
      try {
        const latest = await gitStatus(url, projectId, request.signal);
        if (latest.merging || !latest.repository) throw new OperationError("仓库状态已改变，未提交。");
        if (!paths.every(path => latest.changes.some(change => change.path === path &&
          !["renamed", "copied", "unmerged"].includes(change.status)))) throw new OperationError("所选变更已改变，请刷新后重新选择。");
        const sha = await gitCommit(url, projectId, paths, message, request.signal);
        if (!disposed) {
          result.set(`项目 ${projectId} 已提交 ${sha.slice(0, 8)}（未推送）`);
          if (options.url() === url && options.projectId() === projectId) selected.set([]);
        }
      } catch (failure) {
        if (!disposed) result.set(failure instanceof OperationError ? failure.message : "提交结果未确认，请检查历史；不会自动重试。");
      } finally {
        clearTimeout(timeout);
        if (!disposed) { busy.set(false); void refresh(); }
      }
    },
  };
}
export type GitState = ReturnType<typeof createGitState>;

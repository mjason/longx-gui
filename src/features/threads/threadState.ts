import { effect, signal, untracked } from "nsh";
import { subscribeChannel } from "../../api/channel";
import { query } from "../../api/client";
import { prepend, record, reduceEvent, snapshot, type ThreadView } from "./threadModel";

export function createThreadState(options: {
  url: () => string;
  projectId: () => string;
  threadId: () => string;
  subscribe?: typeof subscribeChannel;
}) {
  const view = signal<ThreadView | null>(null),
    connected = signal(false);
  const error = signal(""),
    loading = signal(true),
    paging = signal(false),
    pageError = signal("");
  const expanded = signal<string[]>([]);
  const retry = signal(0);
  let channel: ReturnType<typeof subscribeChannel> | undefined;
  let generation = 0;
  let alive = true;
  effect(() => {
    const url = options.url(),
      projectId = options.projectId(),
      threadId = options.threadId();
    retry();
    const run = ++generation;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    untracked(() => {
      view.set(null);
      error.set("");
      loading.set(true);
      connected.set(false);
      paging.set(false);
      pageError.set("");
      expanded.set([]);
    });
    let subscription: ReturnType<typeof subscribeChannel> | undefined;
    let batch: unknown[] = [],
      timer: ReturnType<typeof setTimeout> | undefined;
    const current = () => alive && run === generation;
    async function load() {
      try {
        const data = await query<{
          getThread: { id: string; projectId: string; kernelThreadId: string } | null;
        }>(
          url,
          "query NativeThread($id: ID!) { getThread(id: $id) { id projectId kernelThreadId } }",
          { id: threadId },
          controller.signal,
        );
        if (!current()) return;
        const thread = data.getThread;
        if (
          !thread ||
          thread.id !== threadId ||
          thread.projectId !== projectId ||
          !thread.kernelThreadId
        )
          throw new Error("会话不存在、不可访问或不属于当前项目。");
        subscription = (options.subscribe ?? subscribeChannel)({
          url,
          topic: `thread:${thread.kernelThreadId}`,
          params: () => ({ limit: Math.max(80, view()?.items.length ?? 0) }),
          ready: (value) => {
            if (current()) connected.set(value);
          },
          error: () => {
            if (current()) {
              loading.set(false);
              error.set("会话连接中断，正在重连；已显示的记录保留。");
            }
          },
          joined: (value) => {
            if (!current()) return;
            try {
              const next = snapshot(value, thread.kernelThreadId);
              clearTimeout(timer);
              timer = undefined;
              batch = [];
              view.set(next);
              error.set("");
              loading.set(false);
            } catch (failure) {
              loading.set(false);
              error.set(failure instanceof Error ? failure.message : "快照读取失败。");
            }
          },
          event: (name, value) => {
            if (!current() || name !== "event") return;
            batch.push(value);
            if (timer !== undefined) return;
            timer = setTimeout(() => {
              timer = undefined;
              if (!current()) return;
              view.update((previous) =>
                previous ? batch.reduce<ThreadView>(reduceEvent, previous) : null,
              );
              const reverted = batch.some((event) => record(event).method === "thread/reverted");
              batch = [];
              if (reverted) void resync();
            }, 32);
          },
        });
        channel = subscription;
      } catch (failure) {
        if (current()) {
          loading.set(false);
          error.set(failure instanceof Error ? failure.message : "无法读取会话。");
        }
      } finally {
        clearTimeout(timeout);
      }
    }
    async function resync() {
      try {
        const data = await subscription?.request("snapshot", {
          limit: Math.max(80, view()?.items.length ?? 0),
        });
        if (!current() || !data || !view()) return;
        const next = snapshot(data, view()!.threadId);
        if (next.seq >= view()!.seq) view.set(next);
      } catch {
        if (current()) error.set("无法重新同步会话，请重试。");
      }
    }
    void untracked(load);
    return () => {
      ++generation;
      controller.abort();
      clearTimeout(timeout);
      clearTimeout(timer);
      subscription?.stop();
      if (channel === subscription) channel = undefined;
    };
  });
  effect(() => () => {
    alive = false;
  });
  return {
    view,
    connected,
    error,
    loading,
    paging,
    pageError,
    expanded,
    retry: () => retry.set(retry() + 1),
    toggle(id: string) {
      expanded.set(
        expanded().includes(id) ? expanded().filter((value) => value !== id) : [...expanded(), id],
      );
    },
    setExpanded(id: string, open: boolean) {
      expanded.update((values) =>
        open
          ? values.includes(id)
            ? values
            : [...values, id]
          : values.filter((value) => value !== id),
      );
    },
    async earlier() {
      const before = view()?.items[0]?.id,
        subscription = channel,
        run = generation;
      if (!before || !subscription || paging() || !connected() || !view()?.earlier.items) return;
      paging.set(true);
      pageError.set("");
      try {
        const data = await subscription.request("earlier", { before, limit: 80 });
        if (alive && run === generation)
          view.update((previous) => (previous ? prepend(previous, data) : previous));
      } catch {
        if (alive && run === generation) pageError.set("更早记录加载失败，请重试。");
      } finally {
        if (alive && run === generation) paging.set(false);
      }
    },
  };
}
export type ThreadState = ReturnType<typeof createThreadState>;

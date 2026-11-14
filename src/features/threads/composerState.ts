import { signal } from "nsh";
import { type ComposerAttachment, prepareAttachment } from "../../api/attachments";
import {
  compactThread,
  interruptTurn,
  retractTurn,
  setThreadGoal,
  startThread,
  steerTurn,
} from "../../api/composer";
import { sendMessage } from "../../api/messages";
import { OperationError } from "../../api/session";

export interface ComposerPayload {
  text: string;
  images: string[];
  model: string | null;
  effort: string | null;
}
export interface QueuedMessage extends ComposerPayload {
  id: string;
  label: string;
  status: "queued" | "sending" | "uncertain";
}
interface Draft {
  text: string;
  sending: boolean;
  error: string;
  uncertain: boolean;
  awaitingTurn: string;
  pendingCompletion: string;
  nextTurnFrom: string | null;
  model: string | null;
  effort: string | null;
  attachments: ComposerAttachment[];
  queue: QueuedMessage[];
  paused: boolean;
  stopping: boolean;
}
const drafts = new Map<string, ReturnType<typeof createDraft>>();
let nextId = 0;
const draftKey = (url: string, projectId: string, threadId: string) =>
  JSON.stringify([url.replace(/\/+$/, ""), projectId, threadId]);
function createDraft() {
  return signal<Draft>({
    text: "",
    sending: false,
    error: "",
    uncertain: false,
    awaitingTurn: "",
    pendingCompletion: "",
    nextTurnFrom: null,
    model: null,
    effort: null,
    attachments: [],
    queue: [],
    paused: false,
    stopping: false,
  });
}
export function threadDraft(url: string, projectId: string, threadId: string) {
  const key = draftKey(url, projectId, threadId);
  let draft = drafts.get(key);
  if (!draft) {
    draft = createDraft();
    drafts.set(key, draft);
  }
  return draft;
}
export function createComposerState(options: {
  url: () => string;
  projectId: () => string;
  threadId: () => string;
  ready: () => boolean;
  running: () => boolean;
  waiting?: () => boolean;
  turnId?: () => string;
  canRetract?: () => boolean;
  canDiscard?: () => boolean;
  onCreated?: (thread: { id: string; title: string | null; status: string }) => void;
}) {
  const draft = () => threadDraft(options.url(), options.projectId(), options.threadId());
  let lastStoppedTurn = "";
  const blocked = () =>
    !options.ready() ||
    draft()().sending ||
    draft()().stopping ||
    draft()().uncertain ||
    !!draft()().awaitingTurn ||
    draft()().attachments.some((item) => item.status !== "ready");
  const hasContent = () => !!draft()().text.trim() || draft()().attachments.length > 0;
  const mustQueue = () =>
    options.running() || !!draft()().pendingCompletion || !!options.waiting?.();
  const snapshotPayload = (): ComposerPayload => {
    const value = draft()();
    return {
      text: [
        value.text.trim(),
        ...value.attachments.flatMap((item) => (item.text ? [item.text] : [])),
      ]
        .filter(Boolean)
        .join("\n\n"),
      images: value.attachments.flatMap((item) => (item.image ? [item.image] : [])),
      model: value.model,
      effort: value.effort,
    };
  };
  async function bounded<T>(action: (signal: AbortSignal) => Promise<T>) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 90000);
    try {
      return await action(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }
  async function deliver(
    payload: ComposerPayload,
    insert: boolean,
    queueId?: string,
    goalBudget?: number,
  ) {
    const current = draft(),
      url = options.url(),
      projectId = options.projectId();
    const previousTurn = options.turnId?.() || "",
      previouslyRunning = options.running();
    let threadId = options.threadId();
    current.update((entry) => ({
      ...entry,
      sending: true,
      error: "",
      paused: false,
      queue: entry.queue.map((item) =>
        item.id === queueId ? { ...item, status: "sending" } : item,
      ),
    }));
    try {
      if (!threadId) {
        const created = await bounded((signal) =>
          startThread(url, projectId, payload.model, payload.effort, signal),
        );
        threadId = created.id;
        drafts.set(draftKey(url, projectId, threadId), current);
        drafts.set(draftKey(url, projectId, ""), createDraft());
        if (options.url() === url && options.projectId() === projectId && !options.threadId())
          options.onCreated?.(created);
      }
      let turnId = "";
      const goal = payload.text.match(/^\/goal\s+(\S[\s\S]*)$/);
      if (goal) {
        await bounded((signal) => setThreadGoal(url, threadId, goal[1].trim(), goalBudget, signal));
      } else if (insert && options.running()) {
        try {
          const result = await bounded((signal) =>
            steerTurn(url, threadId, payload.text, payload.images, signal),
          );
          turnId = result.kernelTurnId;
        } catch (error) {
          if (!(error instanceof OperationError && error.notRunning)) throw error;
          const result = await sendMessage(url, threadId, payload.text, payload);
          turnId = result.kernelTurnId!;
        }
      } else {
        const result = await sendMessage(url, threadId, payload.text, payload);
        turnId = result.kernelTurnId!;
      }
      current.update((entry) => ({
        ...entry,
        sending: false,
        awaitingTurn: goal && !previouslyRunning ? "__goal_next" : turnId,
        pendingCompletion: turnId,
        nextTurnFrom: goal && !previouslyRunning ? previousTurn : null,
        queue: entry.queue.filter((item) => item.id !== queueId),
      }));
      return true;
    } catch {
      current.update((entry) => ({
        ...entry,
        sending: false,
        uncertain: true,
        paused: true,
        error: "发送结果未确认。请先核对会话记录，避免重复发送；内容已保留。",
        queue: entry.queue.map((item) =>
          item.id === queueId ? { ...item, status: "uncertain" } : item,
        ),
      }));
      return false;
    }
  }
  function captureAttachments() {
    const current = draft(),
      url = options.url(),
      projectId = options.projectId();
    return async (files: File[]) => {
      for (const file of files) {
        const id = `attachment-${++nextId}`;
        current.update((value) => ({
          ...value,
          attachments: [
            ...value.attachments,
            { id, name: file.name, type: file.type, size: file.size, status: "preparing" },
          ],
        }));
        try {
          if (file.size > 512 * 1024 * 1024) throw new Error("单个附件不能超过 512 MiB。");
          const prepared = await bounded((signal) =>
            prepareAttachment(url, projectId, file, signal),
          );
          current.update((value) => ({
            ...value,
            attachments: value.attachments.map((item) =>
              item.id === id ? { ...item, ...prepared, status: "ready" } : item,
            ),
          }));
        } catch (error) {
          current.update((value) => ({
            ...value,
            attachments: value.attachments.map((item) =>
              item.id === id
                ? {
                    ...item,
                    status: "failed",
                    error: error instanceof Error ? error.message : "附件处理失败。",
                  }
                : item,
            ),
          }));
        }
      }
    };
  }
  return {
    draft,
    blocked,
    hasContent,
    mustQueue,
    snapshotPayload,
    scope: () => draftKey(options.url(), options.projectId(), options.threadId()),
    captureAttachments,
    edit(text: string) {
      draft().update((value) => ({ ...value, text }));
    },
    model(model: string | null) {
      draft().update((value) => ({ ...value, model, effort: null }));
    },
    effort(effort: string | null) {
      draft().update((value) => ({ ...value, effort }));
    },
    acknowledge() {
      draft().update((value) => ({
        ...value,
        uncertain: false,
        error: "",
        queue: value.queue.map((item) =>
          item.status === "uncertain" ? { ...item, status: "queued" } : item,
        ),
      }));
    },
    observeTurn(id: string, status?: string) {
      const current = draft();
      if (status === "interrupted" && id && id !== lastStoppedTurn) {
        lastStoppedTurn = id;
        current.update((value) => ({ ...value, paused: true }));
      }
      if (id && current().nextTurnFrom !== null && id !== current().nextTurnFrom)
        current.update((value) => ({
          ...value,
          nextTurnFrom: null,
          awaitingTurn: "",
          pendingCompletion: id,
        }));
      if (id && current().awaitingTurn === id)
        current.update((value) => ({ ...value, awaitingTurn: "" }));
      if (
        id &&
        current().pendingCompletion === id &&
        ["completed", "failed", "interrupted"].includes(status || "")
      )
        current.update((value) => ({ ...value, pendingCompletion: "" }));
    },
    addFiles: (files: File[]) => captureAttachments()(files),
    removeAttachment(id: string) {
      draft().update((value) => ({
        ...value,
        attachments: value.attachments.filter((item) => item.id !== id),
      }));
    },
    async send(insert = false) {
      if (blocked() || !hasContent()) return;
      const current = draft(),
        original = current(),
        payload = snapshotPayload();
      if (mustQueue() && !insert) {
        current.update((value) => ({
          ...value,
          text: "",
          attachments: [],
          queue: [
            ...value.queue,
            {
              ...payload,
              id: `queue-${++nextId}`,
              label: original.text || original.attachments.map((item) => item.name).join("、"),
              status: "queued",
            },
          ],
        }));
        return;
      }
      const sent = await deliver(payload, insert);
      if (sent) {
        const ids = new Set(original.attachments.map((item) => item.id));
        current.update((value) => ({
          ...value,
          text: value.text === original.text ? "" : value.text,
          attachments: value.attachments.filter((item) => !ids.has(item.id)),
        }));
      }
    },
    async drain() {
      if (blocked() || mustQueue() || draft()().paused) return;
      const first = draft()().queue[0];
      if (first?.status === "queued") await deliver(first, false, first.id);
    },
    async insertQueued(id: string) {
      const item = draft()().queue.find((value) => value.id === id);
      if (!item || blocked() || item.status !== "queued") return;
      await deliver(item, true, id);
    },
    removeQueued(id: string) {
      draft().update((value) => ({
        ...value,
        queue: value.queue.filter((item) => item.id !== id || item.status === "sending"),
      }));
    },
    moveQueued(id: string, direction: -1 | 1) {
      draft().update((value) => {
        const queue = [...value.queue],
          index = queue.findIndex((item) => item.id === id),
          next = index + direction;
        if (
          index >= 0 &&
          next >= 0 &&
          next < queue.length &&
          queue[index].status === "queued" &&
          queue[next].status === "queued"
        )
          [queue[index], queue[next]] = [queue[next], queue[index]];
        return { ...value, queue };
      });
    },
    async stop() {
      const current = draft(),
        id = options.turnId?.(),
        url = options.url(),
        threadId = options.threadId();
      if (!id || !options.running() || current().stopping || current().sending || !options.ready())
        return;
      current.update((value) => ({ ...value, stopping: true, paused: true, error: "" }));
      try {
        if (options.canRetract?.()) {
          try {
            const text = await bounded((signal) => retractTurn(url, threadId, id, signal));
            current.update((value) => ({
              ...value,
              text: [text, value.text].filter(Boolean).join("\n\n"),
              awaitingTurn: "",
              pendingCompletion: "",
              nextTurnFrom: null,
            }));
          } catch (error) {
            if (error instanceof OperationError && error.rejected && !error.notRunning)
              await bounded((signal) => interruptTurn(url, threadId, id, signal));
            else throw error;
          }
        } else await bounded((signal) => interruptTurn(url, threadId, id, signal));
      } catch (error) {
        if (!(error instanceof OperationError && error.notRunning))
          current.update((value) => ({
            ...value,
            error: "停止结果未确认，请核对会话状态；不会自动重试。",
          }));
      } finally {
        current.update((value) => ({ ...value, stopping: false }));
      }
    },
    async resume() {
      if (blocked()) return;
      draft().update((value) => ({ ...value, paused: false }));
      if (!draft()().queue.length)
        await deliver(
          { text: "继续", images: [], model: draft()().model, effort: draft()().effort },
          false,
        );
    },
    async discardStopped() {
      const current = draft(),
        id = options.turnId?.(),
        url = options.url(),
        threadId = options.threadId();
      if (blocked() || options.running() || !id || !options.canDiscard?.()) return;
      current.update((value) => ({ ...value, stopping: true, paused: true, error: "" }));
      try {
        const text = await bounded((signal) => retractTurn(url, threadId, id, signal));
        current.update((value) => ({
          ...value,
          text: [text, value.text].filter(Boolean).join("\n\n"),
          awaitingTurn: "",
          pendingCompletion: "",
        }));
      } catch {
        current.update((value) => ({
          ...value,
          error: "撤回结果未确认，请核对会话，不会自动重试。",
        }));
      } finally {
        current.update((value) => ({ ...value, stopping: false }));
      }
    },
    async compact() {
      if (blocked() || mustQueue() || !options.threadId()) return;
      const current = draft(),
        url = options.url(),
        id = options.threadId();
      current.update((value) => ({ ...value, sending: true, error: "" }));
      try {
        await bounded((signal) => compactThread(url, id, signal));
      } catch {
        current.update((value) => ({
          ...value,
          error: "压缩结果未确认，请核对会话；不会自动重试。",
        }));
      } finally {
        current.update((value) => ({ ...value, sending: false }));
      }
    },
    async goal(objective: string, tokenBudget?: number) {
      if (blocked() || !objective.trim()) return false;
      return deliver(
        {
          text: `/goal ${objective.trim()}`,
          images: [],
          model: draft()().model,
          effort: draft()().effort,
        },
        false,
        undefined,
        tokenBudget,
      );
    },
  };
}
export type ComposerState = ReturnType<typeof createComposerState>;

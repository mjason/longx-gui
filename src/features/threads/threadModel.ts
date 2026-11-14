export type RecordValue = Record<string, unknown>;
export interface ThreadItem extends RecordValue {
  id: string;
  type: string;
  turnId?: string;
}
export interface ThreadView {
  seq: number;
  threadId: string;
  items: ThreadItem[];
  turn: RecordValue | null;
  status: unknown;
  requests: RecordValue[];
  earlier: { items: number; turns: number; partial: number };
}
export function record(value: unknown): RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
}
export const text = (value: unknown): string => (typeof value === "string" ? value : "");
function items(value: unknown): ThreadItem[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item?.id !== "string" || typeof item?.type !== "string")
  )
    throw new Error("会话记录格式不兼容。");
  const seen = new Set<string>();
  return value.filter((item) => !seen.has(item.id) && !!seen.add(item.id));
}
function earlier(value: unknown) {
  const source = record(value);
  const count = (key: string) =>
    typeof source[key] === "number" && Number.isFinite(source[key])
      ? Math.max(0, source[key] as number)
      : 0;
  return { items: count("items"), turns: count("turns"), partial: count("partial") };
}
export function snapshot(value: unknown, threadId: string): ThreadView {
  const source = record(value);
  if (
    source.thread_id !== threadId ||
    typeof source.seq !== "number" ||
    !Number.isFinite(source.seq)
  )
    throw new Error("会话快照格式不兼容或会话不匹配。");
  return {
    threadId,
    seq: source.seq,
    items: items(source.items),
    turn: source.turn ? record(source.turn) : null,
    status: source.status,
    requests: Array.isArray(source.pending_requests) ? source.pending_requests.map(record) : [],
    earlier: earlier(source.earlier),
  };
}
export function prepend(view: ThreadView, value: unknown): ThreadView {
  const page = record(value),
    seen = new Set(view.items.map((item) => item.id));
  return {
    ...view,
    items: [...items(page.items).filter((item) => !seen.has(item.id)), ...view.items],
    earlier: earlier(page.earlier),
  };
}
const deltas: Record<string, [string, string?]> = {
  "item/agentMessage/delta": ["text"],
  "item/reasoning/summaryTextDelta": ["summary", "summaryIndex"],
  "item/reasoning/textDelta": ["content", "contentIndex"],
  "item/commandExecution/outputDelta": ["aggregatedOutput"],
  "item/fileChange/outputDelta": ["output"],
};
export function reduceEvent(view: ThreadView, value: unknown): ThreadView {
  const event = record(value);
  if (
    typeof event.seq !== "number" ||
    !Number.isFinite(event.seq) ||
    event.seq <= view.seq ||
    typeof event.method !== "string"
  )
    return view;
  const params = record(event.params),
    method = event.method;
  const next = { ...view, seq: event.seq };
  if (method === "turn/started" || method === "turn/completed")
    return { ...next, turn: record(params.turn) };
  if (method === "thread/status/changed") return { ...next, status: params.status };
  if (method === "thread/reverted") {
    const removed = new Set(Array.isArray(params.turnIds) ? params.turnIds : []);
    return {
      ...next,
      items: view.items.filter((item) => !removed.has(item.turnId)),
      turn: removed.has(view.turn?.id) ? null : view.turn,
    };
  }
  if (method === "serverRequest/resolved")
    return {
      ...next,
      requests: view.requests.filter((request) => String(request.id) !== String(params.requestId)),
    };
  if (method === "item/started" || method === "item/completed") {
    const item = record(params.item);
    if (typeof item.id !== "string" || typeof item.type !== "string") return next;
    const found = view.items.findIndex((value) => value.id === item.id);
    const updated = {
      ...item,
      ...(typeof params.turnId === "string" ? { turnId: params.turnId } : {}),
    } as ThreadItem;
    const values = [...view.items];
    if (found < 0) values.push(updated);
    else values[found] = updated;
    return { ...next, items: values };
  }
  const delta = deltas[method];
  if (delta && typeof params.itemId === "string" && typeof params.delta === "string") {
    const [field, indexKey] = delta;
    const values = [...view.items],
      at = values.findIndex((item) => item.id === params.itemId);
    const item = at < 0 ? { id: params.itemId, type: "unknown" } : values[at];
    let content: string | string[];
    if (indexKey || Array.isArray(item[field])) {
      content = Array.isArray(item[field]) ? [...(item[field] as string[])] : [];
      const index = indexKey ? params[indexKey] : Math.max(0, content.length - 1);
      if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index > 10000)
        return next;
      while (content.length <= index) content.push("");
      content[index] = text(content[index]) + params.delta;
    } else content = text(item[field]) + params.delta;
    const updated = { ...item, [field]: content };
    if (at < 0) values.push(updated);
    else values[at] = updated;
    return { ...next, items: values };
  }
  if (
    "requestId" in params &&
    !view.requests.some((request) => String(request.id) === String(params.requestId))
  )
    return { ...next, requests: [...view.requests, { id: params.requestId, method, params }] };
  return next;
}
export function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((part) => (typeof part === "string" ? part : text(record(part).text)))
    .filter(Boolean)
    .join("\n");
}

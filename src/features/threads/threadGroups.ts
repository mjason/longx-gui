import { contentText, record, type ThreadItem } from "./threadModel";

export type ThreadRowData =
  | { kind: "message"; id: string; item: ThreadItem }
  | { kind: "activity"; id: string; turnId: string; items: ThreadItem[] };
export type ActivityRow = Extract<ThreadRowData, { kind: "activity" }>;
export function isConversationMessage(item: ThreadItem) {
  return (
    item.type === "agentMessage" ||
    (item.type === "userMessage" && !["job", "goal"].includes(String(record(item.origin).kind)))
  );
}

/** Stable member-based keys survive appends and history prepends. */
export function groupThreadItems(
  items: ThreadItem[],
  previous: ThreadRowData[] = [],
): ThreadRowData[] {
  const membership = new Map<string, string>();
  for (const row of previous)
    if (row.kind === "activity") for (const item of row.items) membership.set(item.id, row.id);
  const result: ThreadRowData[] = [],
    used = new Set<string>();
  let pending: ThreadItem[] = [];
  function flush() {
    if (!pending.length) return;
    const known = pending.map((item) => membership.get(item.id)).find((id) => id && !used.has(id));
    const id = known ?? `activity:${pending[0].id}`;
    const unique = used.has(id) ? `${id}:${pending[0].id}` : id;
    used.add(unique);
    result.push({ kind: "activity", id: unique, turnId: pending[0].turnId ?? "", items: pending });
    pending = [];
  }
  for (const item of items) {
    if (item.type === "reasoning" && !contentText(item.summary) && !contentText(item.content))
      continue;
    if (isConversationMessage(item)) {
      flush();
      result.push({ kind: "message", id: `message:${item.id}`, item });
    } else {
      if (pending.length && pending[0].turnId !== item.turnId) flush();
      pending.push(item);
    }
  }
  flush();
  return result;
}
export function activitySummary(row: ActivityRow) {
  const reasoning = row.items.filter((item) => item.type === "reasoning").length;
  const notices = row.items.filter((item) => item.type === "userMessage").length;
  const tools = row.items.length - reasoning - notices;
  return [
    tools ? `${tools} 次工具活动` : "",
    reasoning ? `${reasoning} 段思考` : "",
    notices ? `${notices} 条任务通知` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
export function activityFailures(row: ActivityRow) {
  return row.items.filter(
    (item) =>
      item.success === false ||
      ["failed", "declined"].includes(String(item.status)) ||
      (typeof item.exitCode === "number" && item.exitCode !== 0),
  ).length;
}

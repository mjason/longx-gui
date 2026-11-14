import { checkPath } from "../../api/files";
import { isConversationMessage, type ThreadRowData } from "./threadGroups";
import { record, type ThreadView, text } from "./threadModel";

export function canRetractTurn(view: ThreadView | null) {
  const id = view?.turn?.id;
  if (!id) return false;
  const items = view.items.filter((item) => item.turnId === id);
  return (
    items.some((item) => item.type === "userMessage" && !item.from && !item.origin) &&
    !items.some((item) =>
      item.type === "agentMessage"
        ? !!text(item.text)
        : !["userMessage", "reasoning"].includes(item.type),
    )
  );
}
export function canDiscardTurn(view: ThreadView | null) {
  const id = view?.turn?.id;
  if (!id) return false;
  const items = view.items.filter((item) => item.turnId === id);
  return (
    items.some((item) => item.type === "userMessage" && !item.from && !item.origin) &&
    !items.some((item) => !["userMessage", "reasoning", "agentMessage"].includes(item.type))
  );
}

export type PresentedThreadRow = ThreadRowData & {
  assistantKey: string | null;
  turnId: string;
  assistantStart: boolean;
  assistantEnd: boolean;
};

/** Add visual ownership without moving or combining transcript records. */
export function presentThreadRows(rows: ThreadRowData[]): PresentedThreadRow[] {
  let unscoped: string | null = null;
  const first = new Map<string, number>(),
    last = new Map<string, number>();
  const result = rows.map((row, at): PresentedThreadRow => {
    const user = row.kind === "message" && row.item.type === "userMessage";
    const turnId = row.kind === "activity" ? row.turnId : (row.item.turnId ?? "");
    if (user) {
      unscoped = null;
      return { ...row, turnId, assistantKey: null, assistantStart: false, assistantEnd: false };
    }
    if (turnId) unscoped = null;
    else if (!unscoped) unscoped = `segment:${row.id}`;
    const key = turnId ? `turn:${turnId}` : unscoped!;
    if (!first.has(key)) first.set(key, at);
    last.set(key, at);
    return { ...row, turnId, assistantKey: key, assistantStart: false, assistantEnd: false };
  });
  for (const [, at] of first) result[at].assistantStart = true;
  for (const [, at] of last) result[at].assistantEnd = true;
  return result;
}

/** Copy assistant prose only, never tool logs, user text or tool arguments. */
export function assistantText(rows: PresentedThreadRow[], key: string) {
  return rows
    .flatMap((row) =>
      row.assistantKey === key && row.kind === "message" && row.item.type === "agentMessage"
        ? [text(row.item.text)]
        : [],
    )
    .filter(Boolean)
    .join("\n\n");
}

export function assistantFiles(rows: PresentedThreadRow[], key: string) {
  const files = new Map<string, { path: string; deleted: boolean }>();
  for (const row of rows) {
    if (row.assistantKey !== key || row.kind !== "activity") continue;
    for (const item of row.items) {
      if (isConversationMessage(item) || item.type !== "fileChange" || !Array.isArray(item.changes))
        continue;
      for (const value of item.changes) {
        const change = record(value),
          path = text(change.path);
        try {
          checkPath(path);
          files.set(path, { path, deleted: change.kind === "delete" });
        } catch {
          /* Only explicit, project-relative file events become actions. */
        }
      }
    }
  }
  return [...files.values()];
}

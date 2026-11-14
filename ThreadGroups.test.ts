import { expect, test } from "nsh/test";
import {
  activityFailures,
  activitySummary,
  groupThreadItems,
} from "./src/features/threads/threadGroups";
import type { ThreadItem } from "./src/features/threads/threadModel";

const tool = (id: string, turnId = "t1"): ThreadItem => ({
  id,
  turnId,
  type: "commandExecution",
  status: "completed",
  exitCode: 0,
});
test("collapses adjacent work without absorbing user messages or assistant prose", () => {
  const rows = groupThreadItems([
    { id: "u", type: "userMessage", content: [] },
    tool("a"),
    { id: "r", type: "reasoning", turnId: "t1", summary: ["摘要"] },
    { id: "empty", type: "reasoning", summary: [], content: [] },
    tool("b"),
    { id: "answer", type: "agentMessage", text: "结果" },
    tool("c"),
  ]);
  expect(rows.map((row) => row.kind)).toEqual(["message", "activity", "message", "activity"]);
  const row = rows[1];
  expect(row.kind).toBe("activity");
  if (row.kind !== "activity") return;
  expect(row.items.map((item) => item.id)).toEqual(["a", "r", "b"]);
  expect(activitySummary(row)).toBe("2 次工具活动 · 1 段思考");
});
test("keeps an expanded group's key stable as events append and earlier pages prepend", () => {
  const first = groupThreadItems([tool("a"), tool("b")]);
  const appended = groupThreadItems([tool("a"), tool("b"), tool("c")], first);
  expect(appended[0].id).toBe(first[0].id);
  const prepended = groupThreadItems([tool("older"), tool("a"), tool("b"), tool("c")], appended);
  expect(prepended[0].id).toBe(first[0].id);
  const split = groupThreadItems(
    [tool("older"), { id: "text", type: "agentMessage", text: "进度" }, tool("a")],
    prepended,
  );
  expect(new Set(split.map((row) => row.id)).size).toBe(split.length);
});
test("never mixes turns and keeps failures and automated job/goal notices in summaries", () => {
  const rows = groupThreadItems([
    { ...tool("bad"), exitCode: 1 },
    { ...tool("denied"), type: "fileChange", status: "declined" },
    { id: "job", type: "userMessage", turnId: "t1", origin: { kind: "job" }, content: [] },
    { id: "goal", type: "userMessage", turnId: "t1", origin: { kind: "goal" }, content: [] },
    tool("other-turn", "t2"),
  ]);
  expect(rows.length).toBe(2);
  if (rows[0].kind !== "activity") return;
  expect(activitySummary(rows[0])).toBe("2 次工具活动 · 2 条任务通知");
  expect(activityFailures(rows[0])).toBe(2);
});
test("a long tool run projects to one closed-by-default group without dropping records", () => {
  const rows = groupThreadItems(Array.from({ length: 300 }, (_, at) => tool(`tool-${at}`)));
  expect(rows.length).toBe(1);
  if (rows[0].kind !== "activity") return;
  expect(rows[0].items.length).toBe(300);
});

import { expect, test } from "nsh/test";
import { groupThreadItems } from "./src/features/threads/threadGroups";
import type { ThreadItem } from "./src/features/threads/threadModel";
import {
  assistantFiles,
  assistantText,
  presentThreadRows,
} from "./src/features/threads/threadPresentation";

test("one identity and footer own a turn without reordering prose and process groups", () => {
  const items: ThreadItem[] = [
    { id: "u", type: "userMessage", turnId: "t", content: [] },
    { id: "a", type: "agentMessage", turnId: "t", text: "先检查。" },
    { id: "tool", type: "commandExecution", turnId: "t", aggregatedOutput: "log" },
    { id: "b", type: "agentMessage", turnId: "t", text: "检查完成。" },
  ];
  const rows = groupThreadItems(items),
    result = presentThreadRows(rows);
  expect(result.map((row) => row.id)).toEqual(rows.map((row) => row.id));
  expect(result.filter((row) => row.assistantStart).length).toBe(1);
  expect(result.filter((row) => row.assistantEnd).length).toBe(1);
  expect(result[0].assistantKey).toBe(null);
  expect(result[1].assistantStart).toBe(true);
  expect(result[3].assistantEnd).toBe(true);
  expect(assistantText(result, "turn:t")).toBe("先检查。\n\n检查完成。");
});
test("historical turns and missing-id segments never share an assistant identity", () => {
  const rows = presentThreadRows(
    groupThreadItems([
      { id: "a", type: "agentMessage", turnId: "t1", text: "一" },
      { id: "b", type: "agentMessage", turnId: "t2", text: "二" },
      { id: "u", type: "userMessage", content: [] },
      { id: "c", type: "agentMessage", text: "三" },
      { id: "v", type: "userMessage", content: [] },
      { id: "d", type: "agentMessage", text: "四" },
    ]),
  );
  expect(rows.filter((row) => row.assistantStart).length).toBe(4);
  expect(rows[3].assistantKey === rows[5].assistantKey).toBe(false);
});
test("related files require explicit structured file changes, safe paths and latest delete state", () => {
  const rows = presentThreadRows(
    groupThreadItems([
      { id: "text", type: "agentMessage", turnId: "t", text: "修改 fake.ts，测试全部通过。" },
      {
        id: "file",
        type: "fileChange",
        turnId: "t",
        changes: [
          { path: "src/real.ts", kind: "update" },
          { path: "../outside.ts", kind: "update" },
          { path: "/absolute.ts", kind: "update" },
          { path: "", kind: "update" },
        ],
      },
      {
        id: "later",
        type: "fileChange",
        turnId: "t",
        changes: [{ path: "src/real.ts", kind: "delete" }],
      },
    ]),
  );
  expect(assistantFiles(rows, "turn:t")).toEqual([{ path: "src/real.ts", deleted: true }]);
  expect(assistantFiles(rows, "turn:another")).toEqual([]);
});

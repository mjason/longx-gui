import { expect, test } from "nsh/test";
import { contentText, prepend, reduceEvent, snapshot } from "./src/features/threads/threadModel";
import { threadSnapshot } from "./tests/fixtures/thread";

test("maps kernel identity, rejects mismatched snapshots and deduplicates snapshot rows", () => {
  const data = threadSnapshot();
  data.items.push(data.items[0]);
  const view = snapshot(data, "kernel-t1");
  expect(view.items.length).toBe(4);
  let failed = false;
  try {
    snapshot(data, "database-id");
  } catch {
    failed = true;
  }
  expect(failed).toBe(true);
});
test("applies stream deltas exactly once by sequence and completes the same stable item", () => {
  const view = snapshot(threadSnapshot(), "kernel-t1");
  const event = {
    seq: 11,
    method: "item/agentMessage/delta",
    params: { itemId: "assistant-1", delta: " appended" },
  };
  const next = reduceEvent(view, event);
  expect(String(next.items[1].text).endsWith(" appended")).toBe(true);
  expect(reduceEvent(next, event)).toBe(next);
  const completed = reduceEvent(next, {
    seq: 12,
    method: "item/completed",
    params: { item: { id: "assistant-1", type: "agentMessage", text: "final" }, turnId: "turn-1" },
  });
  expect(completed.items.length).toBe(4);
  expect(completed.items[1].text).toBe("final");
});
test("merges indexed reasoning, command output and pending requests without executing anything", () => {
  let view = snapshot(threadSnapshot(), "kernel-t1");
  view = reduceEvent(view, {
    seq: 11,
    method: "item/reasoning/summaryTextDelta",
    params: { itemId: "thought-1", summaryIndex: 1, delta: "第二段" },
  });
  expect(contentText(view.items[3].summary)).toContain("第二段");
  view = reduceEvent(view, {
    seq: 12,
    method: "item/commandExecution/outputDelta",
    params: { itemId: "tool-1", delta: "\nfinished" },
  });
  expect(view.items[2].aggregatedOutput).toBe("M src/App.tsx\nfinished");
  view = reduceEvent(view, { seq: 13, method: "approval/request", params: { requestId: 1 } });
  expect(view.requests.length).toBe(1);
  view = reduceEvent(view, {
    seq: 14,
    method: "serverRequest/resolved",
    params: { requestId: "1" },
  });
  expect(view.requests.length).toBe(0);
});
test("prepends history by id and removes reverted turns without rewinding sequence", () => {
  let view = snapshot(threadSnapshot(), "kernel-t1");
  view = prepend(view, {
    items: [{ id: "earlier", type: "userMessage", content: [] }, view.items[0]],
    earlier: { items: 0, turns: 0 },
  });
  expect(view.items.length).toBe(5);
  expect(view.items[0].id).toBe("earlier");
  expect(view.seq).toBe(10);
  view = reduceEvent(view, { seq: 11, method: "thread/reverted", params: { turnIds: ["turn-1"] } });
  expect(view.items.length).toBe(1);
  expect(view.turn).toBe(null);
});

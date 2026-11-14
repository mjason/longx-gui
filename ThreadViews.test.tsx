import { expect, open, test } from "nsh/test";
import { groupThreadItems } from "./src/features/threads/threadGroups";
import {
  isThreadView,
  presentTree,
  toolImageSource,
  viewNodes,
} from "./src/features/threads/threadViews";
import { viewsServer } from "./tests/fixtures/views";

test("native view cards render text, images and actual table cells", async () => {
  const app = await open("./tests/fixtures/ViewsHarness.tsx", { width: 780, height: 900 });
  expect(app.texts()).toContain("验证结果");
  expect(app.texts()).toContain("检查项");
  expect(app.texts()).toContain("类型检查");
  expect(app.texts()).toContain("152");
  await app.waitFor("text:兼容组件形式");
  await app.press("id:theme");
  expect(app.texts()).toContain("已完成");
});
test("present and image tools render inside collapsible execution details and can reopen", async () => {
  const app = await open("./tests/fixtures/ThreadHarness.tsx", {
    width: 1000,
    height: 1200,
    network: { "*": viewsServer },
  });
  await app.waitFor("id:thread-item-assistant-1");
  await app.press("id:views");
  await app.waitFor("id:thread-group-toggle-activity:view-1");
  expect(app.count("id:thread-view-view-1")).toBe(0);
  await app.press("id:thread-group-toggle-activity:view-1");
  await app.press("id:thread-toggle-view-1");
  await app.waitFor("id:thread-view-view-1");
  expect(app.texts()).toContain("会话内表格");
  await app.press("id:thread-collapse-view-1");
  expect(app.count("id:thread-view-view-1")).toBe(0);
  await app.press("id:thread-toggle-view-image-1");
  await app.waitFor("id:thread-tool-image-view-image-1");
  await app.press("id:thread-collapse-view-image-1");
  expect(app.count("id:thread-tool-image-view-image-1")).toBe(0);
  await app.press("id:thread-toggle-view-1");
  await app.press("id:thread-group-toggle-activity:view-1");
  expect(app.count("id:thread-view-view-1")).toBe(0);
  await app.press("id:thread-group-toggle-activity:view-1");
  await app.waitFor("id:thread-view-view-1");
  await app.press("id:thread-collapse-all");
  expect(app.count("id:thread-view-view-1")).toBe(0);
});
test("running views open automatically and completion collapses them without preventing review", async () => {
  const app = await open("./tests/fixtures/ThreadHarness.tsx", {
    width: 1200,
    height: 1000,
    network: { "*": viewsServer },
  });
  await app.waitFor("id:thread-item-assistant-1");
  await app.press("id:views-running");
  await app.press("id:views");
  await app.waitFor("id:thread-tool-image-view-image-1");
  await app.press("id:thread-toggle-view-1");
  await app.waitFor("id:thread-view-view-1");
  await app.press("id:views-finish");
  expect(app.count("id:thread-view-view-1")).toBe(0);
  expect(app.count("id:thread-tool-image-view-image-1")).toBe(0);
  await app.press("id:thread-group-toggle-activity:view-1");
  await app.press("id:thread-toggle-view-1");
  await app.waitFor("id:thread-view-view-1");
});
test("view tool protocol, grouping and attachment paths are bounded and safe", () => {
  const item = {
    id: "p",
    type: "dynamicToolCall",
    namespace: "longx",
    tool: "present",
    arguments: '{"$type":"Text","text":"hello"}',
  };
  expect(isThreadView(item)).toBe(true);
  expect(presentTree(item)).toEqual({ $type: "Text", text: "hello" });
  expect(groupThreadItems([item])[0].kind).toBe("activity");
  expect(presentTree({ ...item, arguments: "{" })).toBe(null);
  expect(viewNodes({ component: "Text", props: { text: "old" } })[0].props.text).toBe("old");
  expect(viewNodes(Array.from({ length: 1000 }, () => "x")).length).toBe(100);
  const image = {
    id: "i",
    type: "dynamicToolCall",
    details: { attachment: true, mime: "image/png", path: "images/a b.png" },
  };
  expect(toolImageSource(image, "p")).toBe("/files/p/_attachments/images/a%20b.png?inline=1");
  for (const path of ["/private/a.png", "../a.png", "a/../b.png", "a\\b.png"])
    expect(toolImageSource({ ...image, details: { ...image.details, path } }, "p")).toBe("");
  expect(toolImageSource({ ...image, success: false }, "p")).toBe("");
});

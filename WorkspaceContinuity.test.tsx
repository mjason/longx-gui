import { type App, expect, open, test } from "nsh/test";
import { createContentTabs } from "./src/features/workspace/contentTabs";
import { editorServer } from "./tests/fixtures/editorServer";

async function setup() {
  const server = editorServer();
  let refreshing = false,
    failRefresh = false;
  const serve = (request: Parameters<typeof server.serve>[0]) => {
    if (refreshing && request.url.includes("NativeProjects")) {
      if (failRefresh) return { status: 503 };
      return { ...server.serve(request), delay: 500 };
    }
    return server.serve(request);
  };
  const app = await open("./App.tsx", {
    width: 1280,
    height: 950,
    platform: "macos",
    clock: {},
    network: { "*": serve, "POST *": serve },
  });
  await app.waitFor("id:file-entry-App.tsx");
  return {
    app,
    refresh: (fail = false) => {
      refreshing = true;
      failRefresh = fail;
    },
  };
}
async function file(app: App) {
  await app.press("id:file-entry-App.tsx");
  await app.keyboard.press("enter");
  await app.waitFor("id:file-editor");
  await app.press("text:export const value = 1;");
}
test("tab snapshots isolate projects and restore the last active conversation", () => {
  const tabs = createContentTabs();
  tabs.activateScope("server-a/project-a");
  tabs.openFile({ name: "same.ts", path: "same.ts" });
  tabs.openThread({ id: "t1", title: "A", status: "idle" });
  tabs.activateScope("server-a/project-b");
  expect(tabs.items().length).toBe(0);
  tabs.openFile({ name: "same.ts", path: "same.ts" });
  tabs.activateScope("server-a/project-a");
  expect(tabs.active()).toBe("chat:t1");
  expect(tabs.items().length).toBe(2);
  tabs.resume();
  expect(tabs.active()).toBe("chat:t1");
  tabs.close("chat:t1");
  tabs.activateScope("server-a/project-b");
  expect(tabs.items().length).toBe(1);
  expect(tabs.active()).toBe("file:same.ts");
  tabs.activateScope("server-a/project-a");
  expect(tabs.items().some((tab) => tab.id === "chat:t1")).toBe(false);
});
test("project switches restore tabs, active editor, unsaved text and expanded directories", async () => {
  const { app } = await setup();
  await app.press("id:file-entry-src");
  await app.waitFor("id:file-entry-src/index.ts");
  await app.press("id:thread-entry-t1");
  await app.type("id:thread-input", "会话草稿A");
  await file(app);
  await app.type("id:file-editor", "// project A draft");
  await app.waitFor("text:未保存");
  await app.press("id:project-tab-p2");
  await app.waitFor("id:project-selected-p2");
  expect(app.count("id:content-tab-file:App.tsx")).toBe(0);
  expect(app.count("id:file-entry-src/index.ts")).toBe(0);
  await file(app);
  await app.type("id:file-editor", "// project B draft");
  await app.waitFor("text:未保存");
  await app.press("id:project-tab-p1");
  await app.waitFor("id:file-editor");
  expect(app.texts().some((text) => text.includes("// project A draft"))).toBe(true);
  expect(app.texts().some((text) => text.includes("// project B draft"))).toBe(false);
  await app.type("id:file-editor", "// resumed");
  expect(app.texts().some((text) => text.includes("// project A draft// resumed"))).toBe(true);
  expect(app.count("id:content-tab-chat:t1")).toBe(1);
  await app.waitFor("id:file-entry-src/index.ts");
  await app.press("id:content-tab-chat:t1");
  expect(app.value("id:thread-input")).toBe("会话草稿A");
  await app.press("id:project-tab-p2");
  await app.waitFor("id:file-editor");
  expect(app.texts().some((text) => text.includes("// project B draft"))).toBe(true);
  await app.press("id:project-tab-p1");
  await app.waitFor("id:thread-input");
  expect(app.value("id:thread-input")).toBe("会话草稿A");
});
test("selecting the same project does not replace its conversation with a new-session tab", async () => {
  const { app } = await setup();
  await app.press("id:thread-entry-t1");
  await app.type("id:thread-input", "keep");
  await app.press("id:project-tab-p1");
  expect(app.count("id:content-tab-chat:t1")).toBe(1);
  expect(app.count("id:content-tab-chat:new")).toBe(0);
  expect(app.value("id:thread-input")).toBe("keep");
});
test("refresh and failed reconnects preserve active documents and never remount the same editor", async () => {
  const { app, refresh } = await setup();
  await app.press("id:thread-entry-t1");
  await file(app);
  await app.type("id:file-editor", "// do not close");
  await app.waitFor("text:未保存");
  const reads = () =>
    app.requests().filter((request) => request.url.includes("NativeReadFile")).length;
  const before = reads();
  refresh();
  await app.press("id:refresh-projects");
  expect(app.count("id:content-tab-chat:t1")).toBe(1);
  expect(app.value("id:file-editor")).toContain("// do not close");
  await app.clock!.runFor(700);
  expect(app.count("id:content-tab-file:App.tsx")).toBe(1);
  expect(reads()).toBe(before);
  refresh(true);
  await app.press("id:refresh-projects");
  await app.waitFor("text:连接失败");
  expect(app.count("id:content-tab-chat:t1")).toBe(1);
  expect(app.value("id:file-editor")).toContain("// do not close");
});
test("server switches restore separate states even when project IDs and file paths match", async () => {
  const { app } = await setup();
  await file(app);
  await app.type("id:file-editor", "// server one");
  await app.waitFor("text:未保存");
  await app.press("id:add-server");
  await app.type("id:server-address", "https://two.example");
  await app.press("id:confirm-add-server");
  await app.waitFor("id:server-selected-2");
  await app.waitFor("id:file-entry-App.tsx");
  expect(app.count("id:content-tab-file:App.tsx")).toBe(0);
  await file(app);
  await app.type("id:file-editor", "// server two");
  await app.waitFor("text:未保存");
  await app.press("id:top-tab-1");
  await app.waitFor("id:file-editor");
  expect(app.texts().some((text) => text.includes("// server one"))).toBe(true);
  expect(app.texts().some((text) => text.includes("// server two"))).toBe(false);
  await app.press("id:top-tab-2");
  await app.waitFor("id:file-editor");
  expect(app.texts().some((text) => text.includes("// server two"))).toBe(true);
});
test("each project restores its own file filter and tool-panel visibility", async () => {
  const { app } = await setup();
  await app.press("id:search-files");
  await app.type("id:sidebar-search", "App");
  expect(app.count("id:file-entry-src")).toBe(0);
  await app.press("id:project-tab-p2");
  await app.waitFor("id:file-entry-src");
  expect(app.count("id:sidebar-search")).toBe(0);
  await app.press("id:project-tab-p1");
  await app.waitFor("id:sidebar-search");
  expect(app.value("id:sidebar-search")).toBe("App");
  expect(app.count("id:file-entry-src")).toBe(0);
  await app.press("id:nav-branch");
  await app.waitFor("id:git-panel");
  await app.press("id:project-tab-p2");
  await app.waitFor("id:file-entry-src");
  expect(app.count("id:git-panel")).toBe(0);
  await app.press("id:project-tab-p1");
  await app.waitFor("id:git-panel");
});

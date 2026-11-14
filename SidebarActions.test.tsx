import { type App, expect, open, type StubRequest, test } from "nsh/test";
import { editorServer } from "./tests/fixtures/editorServer";

function fixture() {
  const base = editorServer();
  let entries = [
    { name: "src", path: "src", kind: "dir", size: 0 },
    { name: "App.tsx", path: "App.tsx", kind: "file", size: 100 },
    { name: "index.ts", path: "src/index.ts", kind: "file", size: 32 },
  ];
  let threads = [{ id: "t1", title: "界面设计", status: "idle" }];
  const writes: { query: string; variables: { id?: string; input?: Record<string, string> } }[] =
    [];
  let fail = false;
  function serve(request: StubRequest) {
    const url = new URL(request.url);
    const body =
      request.method === "POST"
        ? JSON.parse(request.body || "{}")
        : {
            query: url.searchParams.get("query") || "",
            variables: JSON.parse(url.searchParams.get("variables") || "{}"),
          };
    const { query, variables } = body;
    if (request.method === "GET" && query.includes("NativeWorkspace"))
      return {
        body: {
          data: {
            listFiles: entries.filter((entry) => !entry.path.includes("/")),
            listThreads: threads,
          },
        },
      };
    if (request.method === "GET" && query.includes("NativeDirectory"))
      return {
        body: {
          data: {
            listFiles: entries.filter(
              (entry) => entry.path.split("/").slice(0, -1).join("/") === variables.path,
            ),
          },
        },
      };
    if (
      request.method !== "POST" ||
      !/Native(Entry|RenameThread|ArchiveThread|DeleteThread)/.test(query)
    )
      return base.serve(request);
    writes.push(body);
    if (fail) return { status: 503 };
    const input = variables.input || {};
    if (query.includes("NativeRenameThread")) {
      threads = threads.map((thread) => ({ ...thread, title: input.title }));
      return { body: { data: { renameThread: { result: threads[0], errors: [] } } } };
    }
    if (query.includes("NativeArchiveThread")) {
      threads = threads.map((thread) => ({ ...thread, status: "archived" }));
      return { body: { data: { archiveThread: { result: threads[0], errors: [] } } } };
    }
    if (query.includes("NativeDeleteThread")) {
      threads = [];
      return { body: { data: { deleteThread: true } } };
    }
    if (query.includes("NativeEntrycreate")) {
      const entry = {
        path: input.path,
        name: input.path.split("/").pop(),
        kind: input.kind,
        size: 0,
      };
      entries.push(entry);
      base.files[input.path] = "";
      return { body: { data: { createEntry: entry } } };
    }
    if (query.includes("NativeEntryrename")) {
      const original = entries.find((entry) => entry.path === input.from)!;
      const result = { ...original, path: input.to, name: input.to.split("/").pop() };
      entries = entries.map((entry) => (entry.path === input.from ? result : entry));
      base.files[input.to] = base.files[input.from] || "";
      delete base.files[input.from];
      return { body: { data: { renameEntry: result } } };
    }
    entries = entries.filter(
      (entry) => entry.path !== input.path && !entry.path.startsWith(`${input.path}/`),
    );
    return { body: { data: { deleteEntry: true } } };
  }
  return {
    serve,
    writes,
    fail: () => {
      fail = true;
    },
  };
}
async function setup() {
  const server = fixture();
  const app = await open("./App.tsx", {
    width: 1280,
    height: 900,
    platform: "macos",
    clock: {},
    network: { "*": server.serve, "POST *": server.serve },
  });
  await app.waitFor("id:file-entry-App.tsx");
  return { app, server };
}
async function replace(app: App, value: string) {
  await app.clear("id:sidebar-action-input");
  await app.type("id:sidebar-action-input", value);
}
test("session context menu renames the actual thread and its open tab", async () => {
  const { app, server } = await setup();
  await app.press("id:thread-entry-t1");
  await app.rightClick("id:thread-entry-t1");
  expect(app.menu()?.map((item) => item.label)).toContain("删除会话…");
  await app.chooseMenuItem("重命名…");
  await replace(app, "新的名称");
  await app.press("id:sidebar-action-confirm");
  await app.waitFor("text:新的名称");
  expect(server.writes[0].variables).toEqual({ id: "t1", input: { title: "新的名称" } });
  expect(app.texts().filter((text) => text === "新的名称").length).toBe(2);
});
test("session deletion requires confirmation, supports cancellation and closes deleted tabs", async () => {
  const { app, server } = await setup();
  await app.press("id:thread-entry-t1");
  await app.rightClick("id:thread-entry-t1");
  await app.chooseMenuItem("删除会话…");
  expect(server.writes.length).toBe(0);
  await app.press("id:sidebar-action-cancel");
  await app.rightClick("id:thread-entry-t1");
  await app.chooseMenuItem("删除会话…");
  await app.press("id:sidebar-action-confirm");
  await app.waitFor("text:暂无会话");
  expect(app.count("id:content-tab-chat:t1")).toBe(0);
  expect(server.writes[0].variables.input).toEqual({ threadId: "t1" });
});
test("file rows use the clicked path for copy and directory creation", async () => {
  const { app, server } = await setup();
  await app.rightClick("id:file-entry-App.tsx");
  await app.chooseMenuItem("复制相对路径");
  expect(app.clipboard()).toBe("App.tsx");
  await app.rightClick("id:file-entry-src");
  await app.chooseMenuItem("复制绝对路径");
  expect(app.clipboard()).toBe("/workspace/longx-gui/src");
  await app.rightClick("id:file-entry-src");
  await app.chooseMenuItem("新建文件夹…");
  await app.type("id:sidebar-action-input", "nested");
  await app.press("id:sidebar-action-confirm");
  await app.waitUntil(() => server.writes.length === 1);
  expect(server.writes[0].variables.input).toEqual({
    projectId: "p1",
    path: "src/nested",
    kind: "dir",
  });
});
test("rename refreshes listings and closes stale file tabs after confirmation", async () => {
  const { app, server } = await setup();
  await app.press("id:file-entry-App.tsx");
  await app.keyboard.press("enter");
  await app.waitFor("id:file-editor");
  await app.rightClick("id:file-entry-App.tsx");
  await app.chooseMenuItem("重命名／移动…");
  await replace(app, "Renamed.tsx");
  await app.press("id:sidebar-action-confirm");
  await app.waitFor("id:file-entry-Renamed.tsx");
  expect(app.count("id:content-tab-file:App.tsx")).toBe(0);
  expect(server.writes[0].variables.input).toEqual({
    projectId: "p1",
    from: "App.tsx",
    to: "Renamed.tsx",
  });
});
test("unsaved descendant drafts block destructive file mutations", async () => {
  const { app, server } = await setup();
  await app.press("id:file-entry-App.tsx");
  await app.keyboard.press("enter");
  await app.waitFor("id:file-editor");
  await app.type("id:file-editor", "// unsaved");
  await app.rightClick("id:file-entry-App.tsx");
  await app.chooseMenuItem("删除…");
  await app.press("id:sidebar-action-confirm");
  await app.waitFor("id:sidebar-action-error");
  expect(app.texts().some((text) => text.includes("有未保存"))).toBe(true);
  expect(server.writes.length).toBe(0);
});
test("target collisions and unsafe paths are rejected without writes", async () => {
  const { app, server } = await setup();
  await app.rightClick("id:file-entry-App.tsx");
  await app.chooseMenuItem("重命名／移动…");
  await replace(app, "../outside.ts");
  await app.press("id:sidebar-action-confirm");
  await app.waitFor("id:sidebar-action-error");
  expect(server.writes.length).toBe(0);
  await replace(app, "src");
  await app.press("id:sidebar-action-confirm");
  await app.waitFor("text:目标已存在，未覆盖已有文件或目录。");
  expect(server.writes.length).toBe(0);
});
test("uncertain mutation results keep the confirmation open and block duplicate writes", async () => {
  const { app, server } = await setup();
  server.fail();
  await app.rightClick("id:thread-entry-t1");
  await app.chooseMenuItem("删除会话…");
  await app.press("id:sidebar-action-confirm");
  await app.waitFor("id:sidebar-action-error");
  expect(app.enabled("id:sidebar-action-confirm")).toBe(false);
  expect(app.count("id:thread-entry-t1")).toBe(1);
  expect(server.writes.length).toBe(1);
});
test("archive uses the real mutation and prevents a second archive from its context menu", async () => {
  const { app, server } = await setup();
  await app.rightClick("id:thread-entry-t1");
  await app.chooseMenuItem("归档…");
  expect(server.writes.length).toBe(0);
  await app.press("id:sidebar-action-confirm");
  await app.waitUntil(() => server.writes.length === 1);
  await app.waitUntil(() => app.count("id:sidebar-action-confirm") === 0);
  await app.rightClick("id:thread-entry-t1");
  expect(app.menu()?.find((item) => item.label === "归档…")?.disabled).toBe(true);
});
test("root menu creates a file without overwriting existing entries", async () => {
  const { app, server } = await setup();
  await app.rightClick("id:files-dock");
  expect(app.menu()?.map((item) => item.label)).not.toContain("删除…");
  await app.chooseMenuItem("新建文件…");
  await app.type("id:sidebar-action-input", "new.md");
  await app.press("id:sidebar-action-confirm");
  await app.waitFor("id:file-entry-new.md");
  expect(server.writes[0].variables.input).toEqual({
    projectId: "p1",
    path: "new.md",
    kind: "file",
  });
});
test("directory deletion warns about descendants and refreshes the tree only after confirmation", async () => {
  const { app, server } = await setup();
  await app.press("id:file-entry-src");
  await app.waitFor("id:file-entry-src/index.ts");
  await app.rightClick("id:file-entry-src");
  await app.chooseMenuItem("删除…");
  expect(app.texts().some((value) => value.includes("整个目录及其中所有文件"))).toBe(true);
  expect(server.writes.length).toBe(0);
  await app.press("id:sidebar-action-confirm");
  await app.waitUntil(() => app.count("id:file-entry-src") === 0);
  expect(app.count("id:file-entry-src/index.ts")).toBe(0);
  expect(server.writes[0].variables.input).toEqual({ projectId: "p1", path: "src" });
});
test("refresh and collapse actions do not write or navigate away from an open editor", async () => {
  const { app, server } = await setup();
  await app.press("id:file-entry-src");
  await app.waitFor("id:file-entry-src/index.ts");
  await app.rightClick("id:file-entry-src");
  await app.chooseMenuItem("刷新目录");
  await app.waitFor("id:file-entry-src/index.ts");
  await app.rightClick("id:file-entry-src");
  await app.chooseMenuItem("全部折叠");
  expect(app.count("id:file-entry-src/index.ts")).toBe(0);
  expect(server.writes.length).toBe(0);
});

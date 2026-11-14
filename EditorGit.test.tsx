import { expect, open, test } from "nsh/test";
import { editorServer } from "./tests/fixtures/editorServer";

async function setup() {
  const server = editorServer();
  const app = await open("./App.tsx", {
    platform: "macos",
    width: 1280,
    height: 840,
    clock: {},
    network: { "*": server.serve, "POST *": server.serve },
  });
  await app.waitFor("id:file-entry-App.tsx");
  return { app, server };
}
async function openFile(app: Awaited<ReturnType<typeof setup>>["app"]) {
  await app.press("id:file-entry-App.tsx");
  await app.keyboard.press("enter");
  await app.waitFor("id:file-editor");
}

test("opens a native editor, saves exact content, and verifies the server read-back", async () => {
  const { app, server } = await setup();
  await openFile(app);
  await app.type("id:file-editor", "");
  await app.keyboard.press("mod+a");
  await app.keyboard.press("backspace");
  await app.type("id:file-editor", "export const changed = 42;\n");
  expect(app.enabled("id:save-file")).toBe(true);
  expect(app.texts()).toContain("未保存");
  await app.press("id:save-file");
  await app.waitUntil(
    () =>
      server.files["App.tsx"] === "export const changed = 42;\n" &&
      !app.enabled("id:save-file") &&
      !app.texts().includes("正在保存…"),
  );
  expect(app.requests().filter((request) => request.method === "POST").length).toBe(1);
  expect(app.count("id:editor-error")).toBe(0);
});

test("keeps drafts across project changes and asks before closing dirty files", async () => {
  const { app } = await setup();
  await openFile(app);
  await app.type("id:file-editor", "// draft\n");
  await app.press("id:close-content-file:App.tsx");
  expect(app.dialogs().some((dialog) => dialog.title === "未保存文件")).toBe(true);
  await app.wait(200);
  await app.press("id:project-tab-p2");
  await app.waitFor("id:file-entry-App.tsx");
  await app.press("id:project-tab-p1");
  await app.waitFor("id:file-entry-App.tsx");
  await openFile(app);
  expect(app.texts()).toContain("未保存");
  app.onDialog(() => "不保存并关闭");
  await app.press("id:close-content-file:App.tsx");
  await app.wait(200);
  expect(app.count("id:content-tab-file:App.tsx")).toBe(0);
  expect(app.requests().filter((request) => request.method === "POST").length).toBe(0);
});

test("supports saving an empty file by shortcut and retains drafts through theme changes", async () => {
  const { app, server } = await setup();
  await openFile(app);
  await app.type("id:file-editor", "");
  await app.keyboard.press("mod+a");
  await app.keyboard.press("backspace");
  await app.press("id:theme-menu");
  await app.press("id:theme-dark");
  expect(app.texts()).toContain("未保存");
  await app.keyboard.press("mod+s");
  await app.waitUntil(() => server.files["App.tsx"] === "" && !app.texts().includes("正在保存…"));
  expect(app.enabled("id:save-file")).toBe(false);
  expect(app.count("id:editor-error")).toBe(0);
});

test("protects dirty window closes and saves before closing a file tab", async () => {
  const { app, server } = await setup();
  await openFile(app);
  await app.type("id:file-editor", "// keep\n");
  await app.window("main").pressClose();
  expect(app.window("main").state()).not.toBe(null);
  expect(app.dialogs().some((dialog) => dialog.title === "关闭工作区")).toBe(true);
  await app.wait(200);
  app.onDialog(() => "保存并关闭");
  await app.press("id:close-content-file:App.tsx");
  await app.waitUntil(() => app.count("id:content-tab-file:App.tsx") === 0);
  expect(server.files["App.tsx"].includes("// keep")).toBe(true);
  expect(app.count("id:editor-error")).toBe(0);
});

test("rejects external-file conflicts before any write and preserves the draft", async () => {
  const { app, server } = await setup();
  await openFile(app);
  await app.type("id:file-editor", "// draft\n");
  server.files["App.tsx"] = "// changed externally\n";
  await app.press("id:save-file");
  await app.waitFor("id:editor-error");
  expect(app.texts()).toContain("磁盘文件已被外部修改，未覆盖。请保留草稿并核对外部版本。");
  expect(app.requests().filter((request) => request.method === "POST").length).toBe(0);
  expect(app.enabled("id:save-file")).toBe(true);
});

test("blocks writes without a CSRF session and preserves text after failed saves", async () => {
  const { app, server } = await setup();
  server.options.csrf = false;
  await openFile(app);
  await app.type("id:file-editor", "// draft\n");
  await app.press("id:save-file");
  await app.waitFor("id:editor-error");
  expect(app.requests().filter((request) => request.method === "POST").length).toBe(0);
  server.options.csrf = true;
  server.options.failWrite = true;
  await app.press("id:save-file");
  await app.waitUntil(
    () =>
      app.requests().some((request) => request.method === "POST") && app.enabled("id:save-file"),
  );
  expect(server.files["App.tsx"]).toBe("export const value = 1;\n");
});

test("makes binary and truncated files non-editable and supports read retry", async () => {
  const { app, server } = await setup();
  server.options.failRead = true;
  await app.press("id:file-entry-App.tsx");
  await app.keyboard.press("enter");
  await app.waitFor("id:retry-file");
  server.options.failRead = false;
  server.options.binary = true;
  await app.press("id:retry-file");
  await app.waitFor("text:二进制文件不支持文本编辑。");
  expect(app.count("id:file-editor")).toBe(0);
  server.options.binary = false;
  server.options.truncated = true;
  await app.press("id:reload-file");
  await app.waitFor("text:文件过大，仅显示截断预览，禁止保存。");
  expect(app.enabled("id:save-file")).toBe(false);
});

test("shows native Git diff and history and commits only checked paths after confirmation", async () => {
  const { app, server } = await setup();
  await app.press("id:nav-branch");
  await app.waitFor("id:git-diff-App.tsx");
  await app.press("id:git-tab-history");
  await app.waitFor("id:git-history-pane");
  expect(app.texts()).toContain("Initial workspace");
  await app.press("id:git-tab-changes");
  await app.press("id:git-diff-App.tsx");
  await app.waitFor("id:git-diff-view");
  await app.press("id:git-select-App.tsx");
  await app.type("id:git-message", "Save editor integration");
  await app.press("id:git-commit");
  expect(server.commits.length).toBe(0);
  expect(app.dialogs().some((dialog) => dialog.title === "确认 Git 提交")).toBe(true);
  app.onDialog(() => "确认提交");
  await app.press("id:git-commit");
  await app.waitUntil(() => server.commits.length === 1);
  await app.waitFor("id:git-result");
  expect(server.commits[0].paths).toEqual(["App.tsx"]);
  expect(server.commits[0].message).toBe("Save editor integration");
  expect(app.value("id:git-message")).toBe("");
  expect(app.requests().filter((request) => request.method === "POST").length).toBe(1);
});

test("prevents commits while selected files have drafts or the repository is merging", async () => {
  const { app, server } = await setup();
  await openFile(app);
  await app.type("id:file-editor", "// draft\n");
  await app.press("id:nav-branch");
  await app.waitFor("id:git-select-App.tsx");
  await app.press("id:git-select-App.tsx");
  await app.type("id:git-message", "Do not commit");
  expect(app.enabled("id:git-commit")).toBe(false);
  server.options.merging = true;
  await app.press("id:refresh-git");
  await app.waitFor("text:合并进行中，暂不支持提交，请先在外部处理合并。");
  expect(app.enabled("id:git-commit")).toBe(false);
  expect(server.commits.length).toBe(0);
});

test("retries failed diff reads without changing the repository", async () => {
  const { app, server } = await setup();
  server.options.failDiff = true;
  await app.press("id:nav-branch");
  await app.waitFor("id:git-diff-App.tsx");
  await app.press("id:git-diff-App.tsx");
  await app.waitFor("id:retry-diff");
  server.options.failDiff = false;
  await app.press("id:retry-diff");
  await app.waitFor("id:git-diff-view");
  expect(app.requests().every((request) => request.method === "GET")).toBe(true);
});

test("defaults to split diff and switches layouts without fetching again or losing selections", async () => {
  const { app } = await setup();
  await app.press("id:nav-branch");
  await app.waitFor("id:git-diff-App.tsx");
  expect(app.count("id:dock-tab-conversations")).toBe(0);
  await app.press("id:git-diff-App.tsx");
  await app.waitFor("id:diff-mode-split");
  expect(app.texts()).toContain("HEAD · 旧版本");
  expect(app.texts()).toContain("工作区 · 新版本");
  const requests = app.requests().length;
  await app.press("id:diff-layout-unified");
  await app.waitFor("id:diff-mode-unified");
  await app.press("id:diff-layout-split");
  await app.waitFor("id:diff-mode-split");
  expect(app.requests().length).toBe(requests);
  expect(app.texts()).toContain("+1 −1");
  await app.press("id:nav-folder");
  await app.waitFor("id:dock-tab-conversations");
  await app.press("id:nav-branch");
  await app.waitFor("id:git-panel");
  await app.press("id:nav-chat");
  await app.waitFor("id:dock-tab-conversations");
  expect(app.count("id:git-panel")).toBe(0);
});

test("keeps commit draft across Changes and History and selects all without staging", async () => {
  const { app, server } = await setup();
  await app.press("id:nav-branch");
  await app.waitFor("id:git-select-all");
  await app.type("id:git-message", "Review changes\n\nA multiline commit.");
  await app.press("id:git-select-all");
  await app.waitFor("text:取消全选");
  expect(app.texts()).toContain("2 个变更 · 已选 2");
  await app.press("id:git-tab-history");
  await app.waitFor("id:git-history-pane");
  expect(app.count("id:git-changes-pane")).toBe(0);
  expect(app.value("id:git-message")).toBe("Review changes\n\nA multiline commit.");
  await app.press("id:git-tab-changes");
  await app.waitFor("id:git-changes-pane");
  expect(app.texts()).toContain("2 个变更 · 已选 2");
  await app.press("id:git-view-diff");
  await app.waitFor("id:git-diff-view");
  await app.press("id:git-select-all");
  await app.waitFor("text:全选提交");
  expect(app.enabled("id:git-commit")).toBe(false);
  expect(server.commits.length).toBe(0);
  expect(app.requests().every((request) => request.method === "GET")).toBe(true);
});

test("clean Git sidebar shows the empty state and never offers a fake commit", async () => {
  const server = editorServer();
  const serve = (request: Parameters<typeof server.serve>[0]) => {
    if (new URL(request.url).searchParams.get("query")?.includes("NativeGitStatus")) {
      return {
        body: {
          data: {
            gitChanges: {
              repository: true,
              branch: "main",
              head: "1234567890",
              merging: false,
              changes: [],
              ahead: 0,
              behind: 0,
            },
          },
        },
      };
    }
    return server.serve(request);
  };
  const app = await open("./App.tsx", {
    platform: "macos",
    width: 1280,
    height: 840,
    network: { "*": serve },
  });
  await app.waitFor("id:file-entry-App.tsx");
  await app.press("id:nav-branch");
  await app.waitFor("id:git-clean-state");
  expect(app.enabled("id:git-view-diff")).toBe(false);
  expect(app.enabled("id:git-select-all")).toBe(false);
  expect(app.enabled("id:git-commit")).toBe(false);
  await app.press("id:git-tab-history");
  await app.waitFor("id:git-history-pane");
  expect(app.texts()).toContain("Initial workspace");
  expect(app.requests().every((request) => request.method === "GET")).toBe(true);
});

test("opens source from a diff and reuses an existing dirty editor without reloading", async () => {
  const { app } = await setup();
  await app.press("id:nav-branch");
  await app.waitFor("id:git-diff-App.tsx");
  await app.press("id:git-diff-App.tsx");
  await app.waitFor("id:diff-mode-split");
  await app.press("id:diff-open-source");
  await app.waitFor("id:file-editor");
  await app.type("id:file-editor", "// preserve source draft\n");
  await app.waitFor("text:未保存");
  const reads = () =>
    app
      .requests()
      .filter((request) =>
        new URL(request.url).searchParams.get("query")?.includes("NativeReadFile"),
      ).length;
  const loaded = reads();
  await app.press("id:content-tab-diff:App.tsx");
  await app.waitFor("id:diff-open-source");
  await app.press("id:diff-open-source");
  await app.waitFor("id:file-editor");
  expect(app.count("id:content-tab-file:App.tsx")).toBe(1);
  expect(app.count("id:content-tab-diff:App.tsx")).toBe(1);
  expect(app.texts()).toContain("未保存");
  expect(app.texts().some((text) => text.includes("preserve source draft"))).toBe(true);
  expect(reads()).toBe(loaded);
  expect(app.requests().every((request) => request.method === "GET")).toBe(true);
});

test("shows unchanged lines between distant changes in both full-file diff layouts", async () => {
  const server = editorServer();
  const before = [
    "export const beginning = 0;",
    ...Array.from({ length: 20 }, (_, index) => `export const unchanged${index} = ${index};`),
    "export const end = 0;",
    "",
  ].join("\n");
  const after = before.replace("beginning = 0", "beginning = 1").replace("end = 0", "end = 1");
  const serve = (request: Parameters<typeof server.serve>[0]) => {
    if (new URL(request.url).searchParams.get("query")?.includes("NativeGitFileVersions")) {
      return { body: { data: { gitFileVersions: { before, after, binary: false } } } };
    }
    return server.serve(request);
  };
  const app = await open("./App.tsx", {
    platform: "macos",
    width: 1280,
    height: 840,
    network: { "*": serve },
  });
  await app.waitFor("id:file-entry-App.tsx");
  await app.press("id:nav-branch");
  await app.waitFor("id:git-diff-App.tsx");
  await app.press("id:git-diff-App.tsx");
  await app.waitFor("text:export const unchanged10 = 10;");
  expect(app.texts()).toContain("+2 −2");
  await app.press("id:diff-layout-unified");
  await app.waitFor("id:diff-mode-unified");
  expect(app.texts()).toContain("export const unchanged10 = 10;");
  const queries = app
    .requests()
    .map((request) => new URL(request.url).searchParams.get("query") ?? "");
  expect(queries.filter((query) => query.includes("NativeGitFileVersions")).length).toBe(1);
  expect(queries.some((query) => query.includes("NativeGitDiff"))).toBe(false);
  expect(app.requests().every((request) => request.method === "GET")).toBe(true);
});

test("renders full-file additions and deletions when one version is absent", async () => {
  for (const deleted of [false, true]) {
    const server = editorServer();
    const content = "export const wholeFile = 1;\n";
    const serve = (request: Parameters<typeof server.serve>[0]) => {
      const query = new URL(request.url).searchParams.get("query") ?? "";
      if (query.includes("NativeGitStatus")) {
        return {
          body: {
            data: {
              gitChanges: {
                repository: true,
                branch: "main",
                head: "1234567890",
                merging: false,
                ahead: 0,
                behind: 0,
                changes: [{ path: "App.tsx", status: deleted ? "deleted" : "untracked" }],
              },
            },
          },
        };
      }
      if (query.includes("NativeGitFileVersions")) {
        return {
          body: {
            data: {
              gitFileVersions: {
                before: deleted ? content : null,
                after: deleted ? null : content,
                binary: false,
              },
            },
          },
        };
      }
      return server.serve(request);
    };
    const app = await open("./App.tsx", {
      platform: "macos",
      width: 1280,
      height: 840,
      network: { "*": serve },
    });
    await app.waitFor("id:file-entry-App.tsx");
    await app.press("id:nav-branch");
    await app.waitFor("id:git-diff-App.tsx");
    await app.press("id:git-diff-App.tsx");
    await app.waitFor("text:export const wholeFile = 1;");
    expect(app.enabled("id:diff-open-source")).toBe(!deleted);
    expect(app.requests().every((request) => request.method === "GET")).toBe(true);
  }
});

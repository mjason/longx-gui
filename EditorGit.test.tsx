import { expect, open, test } from "nsh/test";
import { editorServer } from "./tests/fixtures/editorServer";

async function setup() {
  const server = editorServer();
  const app = await open("./App.tsx", { platform: "macos", width: 1280, height: 840, network: { "*": server.serve, "POST *": server.serve } });
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
  await app.waitUntil(() => server.files["App.tsx"] === "export const changed = 42;\n" && !app.enabled("id:save-file") && !app.texts().includes("正在保存…"));
  expect(app.requests().filter(request => request.method === "POST").length).toBe(1);
  expect(app.count("id:editor-error")).toBe(0);
});

test("keeps drafts across project changes and asks before closing dirty files", async () => {
  const { app } = await setup();
  await openFile(app);
  await app.type("id:file-editor", "// draft\n");
  await app.press("id:close-content-file:App.tsx");
  expect(app.dialogs().some(dialog => dialog.title === "未保存文件")).toBe(true);
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
  expect(app.requests().filter(request => request.method === "POST").length).toBe(0);
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
  expect(app.dialogs().some(dialog => dialog.title === "关闭工作区")).toBe(true);
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
  expect(app.requests().filter(request => request.method === "POST").length).toBe(0);
  expect(app.enabled("id:save-file")).toBe(true);
});

test("blocks writes without a CSRF session and preserves text after failed saves", async () => {
  const { app, server } = await setup();
  server.options.csrf = false;
  await openFile(app);
  await app.type("id:file-editor", "// draft\n");
  await app.press("id:save-file");
  await app.waitFor("id:editor-error");
  expect(app.requests().filter(request => request.method === "POST").length).toBe(0);
  server.options.csrf = true;
  server.options.failWrite = true;
  await app.press("id:save-file");
  await app.waitUntil(() => app.requests().some(request => request.method === "POST") && app.enabled("id:save-file"));
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
  expect(app.texts()).toContain("Initial workspace");
  await app.press("id:git-diff-App.tsx");
  await app.waitFor("id:git-diff-view");
  await app.press("id:git-select-App.tsx");
  await app.type("id:git-message", "Save editor integration");
  await app.press("id:git-commit");
  expect(server.commits.length).toBe(0);
  expect(app.dialogs().some(dialog => dialog.title === "确认 Git 提交")).toBe(true);
  app.onDialog(() => "确认提交");
  await app.press("id:git-commit");
  await app.waitUntil(() => server.commits.length === 1);
  await app.waitFor("id:git-result");
  expect(server.commits[0].paths).toEqual(["App.tsx"]);
  expect(server.commits[0].message).toBe("Save editor integration");
  expect(app.requests().filter(request => request.method === "POST").length).toBe(1);
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
  expect(app.requests().every(request => request.method === "GET")).toBe(true);
});

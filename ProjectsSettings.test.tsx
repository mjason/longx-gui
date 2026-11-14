import { type App, expect, open, test } from "nsh/test";
import { projectsServer } from "./tests/fixtures/projects";

async function setup() {
  const server = projectsServer();
  const app = await open("./App.tsx", {
    platform: "macos",
    width: 1280,
    height: 1000,
    clock: {},
    network: { "*": server.serve, "POST *": server.serve },
  });
  await app.waitFor("id:file-entry-App.tsx");
  return { app, server };
}
async function replace(app: App, id: string, text: string) {
  await app.clear(`id:${id}`);
  await app.type(`id:${id}`, text);
}
test("project home is a real tab, preserving existing document tabs and drafts", async () => {
  const { app, server } = await setup();
  await app.press("id:file-entry-App.tsx");
  await app.keyboard.press("enter");
  await app.waitFor("id:file-editor");
  await app.type("id:file-editor", "// draft");
  await app.press("id:projects-home");
  await app.waitFor("id:content-tab-projects:home");
  expect(app.count("id:project-home")).toBe(1);
  expect(app.count("id:content-tab-file:App.tsx")).toBe(1);
  await app.press("id:content-tab-file:App.tsx");
  expect(app.texts()).toContain("未保存");
  expect(server.writes.length).toBe(0);
});
test("quick project switch filters by path and supports the keyboard shortcut", async () => {
  const { app } = await setup();
  await app.keyboard.press("mod+shift+p");
  await app.waitFor("id:project-quick-dialog");
  await app.type("id:project-quick-command", "/workspace/worker");
  expect(app.count("id:quick-project-p1")).toBe(0);
  await app.keyboard.press("enter");
  await app.waitFor("id:project-selected-p2");
  expect(app.count("id:project-quick-dialog")).toBe(0);
  await app.press("id:project-quick-switch");
  await app.press("id:quick-project-p1");
  await app.waitFor("id:project-selected-p1");
});
test("opening a server directory registers that existing path without creating another directory", async () => {
  const { app, server } = await setup();
  await app.press("id:open-project-directory");
  await app.waitFor("id:server-directory-existing");
  await app.press("id:server-directory-existing");
  await app.waitUntil(() => app.value("id:server-directory-path") === "/work/existing");
  expect(app.value("id:project-name")).toBe("existing");
  await app.press("id:project-directory-confirm");
  await app.waitFor("id:project-selected-p3");
  expect(server.writes.length).toBe(1);
  expect(server.writes[0].variables.input).toEqual({
    name: "existing",
    rootPath: "/work/existing",
    initGit: false,
    trustLocalAgent: false,
  });
});
test("new projects create a named directory then register it, with no default trust grant", async () => {
  const { app, server } = await setup();
  await app.press("id:new-project");
  await app.waitFor("id:server-directory-existing");
  await app.type("id:project-name", "新的项目");
  await app.type("id:project-folder-name", "new-project");
  await app.press("id:project-directory-confirm");
  await app.waitFor("id:project-selected-p3");
  expect(server.writes.length).toBe(2);
  expect(server.writes[0].variables.input).toEqual({ parent: "/work", name: "new-project" });
  expect(server.writes[1].variables.input).toEqual({
    name: "新的项目",
    rootPath: "/work/new-project",
    initGit: false,
    trustLocalAgent: false,
  });
});
test("registration rejection retains the created directory and retry does not create it twice", async () => {
  const { app, server } = await setup();
  server.options.failProject = true;
  await app.press("id:new-project");
  await app.waitFor("id:server-directory-existing");
  await app.type("id:project-name", "retry");
  await app.type("id:project-folder-name", "retry");
  await app.press("id:project-directory-confirm");
  await app.waitFor("id:project-directory-error");
  expect(server.writes.length).toBe(2);
  expect(app.texts().some((text) => text.includes("关闭不会删除此目录"))).toBe(true);
  server.options.failProject = false;
  await app.press("id:project-directory-confirm");
  await app.waitFor("id:project-selected-p3");
  expect(
    server.writes.filter((write) => write.query.includes("NativeCreateProjectDirectory")).length,
  ).toBe(1);
});
test("project settings save only changed fields and do not close an open editor", async () => {
  const { app, server } = await setup();
  await app.press("id:file-entry-App.tsx");
  await app.keyboard.press("enter");
  await app.waitFor("id:file-editor");
  await app.type("id:file-editor", "// keep");
  await app.press("id:current-project-settings");
  await app.waitFor("id:project-settings-name");
  await replace(app, "project-settings-name", "Renamed project");
  await app.press("id:project-settings-save");
  await app.waitFor("text:已保存到服务器");
  expect(server.writes[0].variables).toEqual({ id: "p1", input: { name: "Renamed project" } });
  await app.press("id:project-settings-close");
  expect(app.count("id:content-tab-file:App.tsx")).toBe(1);
  expect(app.texts()).toContain("未保存");
  expect(app.value("id:file-editor")).toContain("// keep");
});
test("project trust expansion requires a separate native confirmation and cancellation never writes", async () => {
  const { app, server } = await setup();
  await app.press("id:current-project-settings");
  await app.waitFor("id:project-setting-trustLocalAgent");
  await app.press("id:project-setting-trustLocalAgent");
  app.onDialog(() => "取消");
  await app.press("id:project-settings-save");
  await app.waitUntil(() => app.enabled("id:project-settings-save"));
  expect(server.writes.length).toBe(0);
});
test("local global settings remain local while server model and runtime have separate writes", async () => {
  const { app, server } = await setup();
  await app.keyboard.press("mod+,");
  expect(app.count("id:settings-local-tab")).toBe(1);
  expect(app.requests().some((request) => request.url.includes("NativeServerPreferences"))).toBe(
    false,
  );
  await app.press("id:settings-server-tab");
  await app.waitFor("id:global-default-model");
  await app.press("id:global-default-model");
  await app.press("text:pro · 高级");
  await app.press("id:save-global-model");
  await app.waitFor("id:server-settings-notice");
  expect(server.writes[0].variables.input).toEqual({ name: "pro" });
  await replace(app, "global-runtime-modelRetries", "5");
  await app.press("id:save-global-runtime");
  await app.waitUntil(() => server.writes.length === 2);
  expect(server.writes[1].variables.input).toEqual({ modelRetries: 5 });
});
test("invalid runtime settings and uncertain project results do not trigger duplicate mutations", async () => {
  const { app, server } = await setup();
  await app.keyboard.press("mod+,");
  await app.press("id:settings-server-tab");
  await app.waitFor("id:global-runtime-maxDepth");
  await replace(app, "global-runtime-maxDepth", "-1");
  await app.press("id:save-global-runtime");
  await app.waitFor("id:server-settings-error");
  expect(server.writes.length).toBe(0);
  await app.press("id:close-settings");
  server.options.failWrite = true;
  await app.press("id:current-project-settings");
  await app.waitFor("id:project-settings-name");
  await replace(app, "project-settings-name", "uncertain");
  await app.press("id:project-settings-save");
  await app.waitFor("id:project-settings-error");
  expect(app.enabled("id:project-settings-save")).toBe(false);
  expect(server.writes.length).toBe(1);
});
test("opening an already registered path switches projects without registering it twice", async () => {
  const { app, server } = await setup();
  await app.press("id:open-project-directory");
  await app.waitFor("id:server-directory-existing");
  await replace(app, "server-directory-path", "/workspace/worker");
  await app.press("id:server-directory-go");
  await app.waitUntil(() => app.value("id:project-name") === "worker");
  await app.press("id:project-directory-confirm");
  await app.waitFor("id:project-selected-p2");
  expect(server.writes.length).toBe(0);
});
test("late directory reads cannot overwrite a newer navigation target", async () => {
  const { app, server } = await setup();
  await app.press("id:open-project-directory");
  await app.waitFor("id:server-directory-existing");
  server.options.directoryDelay = 1000;
  await replace(app, "server-directory-path", "/work/other");
  await app.press("id:server-directory-go");
  expect(app.enabled("id:project-directory-confirm")).toBe(false);
  await replace(app, "server-directory-path", "/work/existing");
  await app.press("id:server-directory-go");
  await app.clock!.runFor(1200);
  await app.waitUntil(() => app.value("id:project-name") === "existing");
  expect(app.value("id:server-directory-path")).toBe("/work/existing");
  expect(app.count("id:server-directory-nested")).toBe(0);
  expect(server.writes.length).toBe(0);
});
test("read errors expose retry without guessed project or runtime defaults", async () => {
  const { app, server } = await setup();
  server.options.failRead = true;
  await app.press("id:current-project-settings");
  await app.waitFor("id:project-settings-error");
  expect(app.count("id:project-settings-name")).toBe(0);
  expect(app.enabled("id:project-settings-save")).toBe(false);
  await app.press("id:project-settings-close");
  await app.keyboard.press("mod+,");
  await app.press("id:settings-server-tab");
  await app.waitFor("id:server-settings-error");
  expect(app.count("id:global-runtime-maxDepth")).toBe(0);
  expect(server.writes.length).toBe(0);
});
test("home has a dedicated new-session entry and saved defaults refresh an already mounted composer", async () => {
  const { app, server } = await setup();
  expect(app.count("id:thread-input")).toBe(0);
  await app.press("id:home-new-thread");
  await app.waitFor("id:thread-input");
  await app.waitFor("text:plus");
  await app.keyboard.press("mod+,");
  await app.press("id:settings-server-tab");
  await app.waitFor("id:global-default-model");
  await app.press("id:global-default-model");
  await app.press("text:pro · 高级");
  await app.press("id:save-global-model");
  await app.waitFor("id:server-settings-notice");
  await app.press("id:close-settings");
  await app.waitFor("text:pro");
  expect(server.writes.length).toBe(1);
  expect(app.count("id:thread-input")).toBe(1);
});

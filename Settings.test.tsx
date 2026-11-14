import { expect, open, test } from "nsh/test";
import {
  EDITOR_SETTINGS_KEY,
  normalizeEditorPreferences,
} from "./src/features/settings/editorSettings";
import { editorServer } from "./tests/fixtures/editorServer";

test("validates editor preferences without accepting invalid values or unknown keys", () => {
  const value = normalizeEditorPreferences({
    fontSize: 200,
    lineHeight: 0,
    tabSize: 3,
    softWrap: "yes",
    lineNumbers: false,
    fontFamily: "missing-font",
    unexpected: true,
  });
  expect(value.fontSize).toBe(40);
  expect(value.lineHeight).toBe(1.2);
  expect(value.tabSize).toBe(0);
  expect(value.softWrap).toBe(false);
  expect(value.lineNumbers).toBe(false);
  expect(value.fontFamily).toBe("monospace");
  expect(Object.keys(value).includes("unexpected")).toBe(false);
  expect(normalizeEditorPreferences(null).fontSize).toBe(13);
  expect(normalizeEditorPreferences({ fontSize: NaN }).fontSize).toBe(13);
});

test("opens Settings by the native menu shortcut and persists changes without losing drafts", async () => {
  const server = editorServer();
  const app = await open("./App.tsx", {
    platform: "macos",
    width: 1280,
    height: 840,
    network: { "*": server.serve, "POST *": server.serve },
  });
  await app.waitFor("id:file-entry-App.tsx");
  await app.press("id:file-entry-App.tsx");
  await app.keyboard.press("enter");
  await app.waitFor("id:file-editor");
  await app.type("id:file-editor", "// settings draft\n");
  const requests = app.requests().length;
  await app.keyboard.press("mod+,");
  await app.waitFor("id:settings-dialog");
  await app.press("id:setting-fontSize >> text:+");
  await app.press("id:setting-softWrap");
  await app.press("id:setting-font-family-trigger");
  await app.press("text:Menlo");
  await app.press("id:setting-tab-size-trigger");
  await app.press("text:8 个空格宽");
  await app.waitUntil(() => JSON.parse(app.storage()[EDITOR_SETTINGS_KEY] ?? "{}").tabSize === 8);
  expect(JSON.parse(app.storage()[EDITOR_SETTINGS_KEY]).fontSize).toBe(14);
  expect(JSON.parse(app.storage()[EDITOR_SETTINGS_KEY]).softWrap).toBe(true);
  expect(JSON.parse(app.storage()[EDITOR_SETTINGS_KEY]).fontFamily).toBe("Menlo");
  expect(JSON.parse(app.storage()[EDITOR_SETTINGS_KEY]).tabSize).toBe(8);
  await app.press("id:close-settings");
  await app.waitUntil(() => app.count("id:settings-dialog") === 0);
  expect(app.texts()).toContain("未保存");
  expect(app.requests().length).toBe(requests);
  expect(app.spanStyle("text:export const value = 1;").fontSize).toBe(14);
  await app.keyboard.press("mod+s");
  await app.waitUntil(() => server.files["App.tsx"].includes("// settings draft"));
});

test("restores preferences and resets only editor settings through the in-app menu", async () => {
  const server = editorServer();
  const app = await open("./App.tsx", {
    platform: "macos",
    width: 1280,
    height: 840,
    storage: {
      [EDITOR_SETTINGS_KEY]: JSON.stringify({
        fontSize: 18,
        lineHeight: 1.8,
        tabSize: 4,
        softWrap: true,
      }),
      "appearance.theme": "dark",
    },
    network: { "*": server.serve },
  });
  await app.waitFor("id:file-entry-App.tsx");
  await app.press("id:theme-menu");
  await app.press("id:open-settings");
  await app.waitFor("id:settings-dialog");
  expect(app.value("id:setting-fontSize")).toBe("18");
  await app.press("id:reset-editor-settings");
  await app.waitUntil(() => JSON.parse(app.storage()[EDITOR_SETTINGS_KEY]).fontSize === 13);
  expect(JSON.parse(app.storage()[EDITOR_SETTINGS_KEY]).softWrap).toBe(false);
  expect(app.storage()["appearance.theme"]).toBe("dark");
  await app.keyboard.press("escape");
  await app.waitUntil(() => app.count("id:settings-dialog") === 0);
});

test("corrupt preferences leave the settings usable and can be replaced", async () => {
  const server = editorServer();
  const app = await open("./App.tsx", {
    platform: "macos",
    width: 800,
    height: 660,
    storage: { [EDITOR_SETTINGS_KEY]: "{broken" },
    network: { "*": server.serve },
  });
  await app.keyboard.press("mod+,");
  await app.waitFor("id:settings-dialog");
  expect(app.texts()).toContain("无法读取或保存偏好；当前设置仍在本窗口生效。");
  await app.press("id:reset-editor-settings");
  await app.waitUntil(() => app.texts().includes("已保存到本机"));
  expect(JSON.parse(app.storage()[EDITOR_SETTINGS_KEY]).fontSize).toBe(13);
});

test("uses the saved editor font size in Git diff views", async () => {
  const server = editorServer();
  const app = await open("./App.tsx", {
    platform: "macos",
    width: 1280,
    height: 840,
    storage: { [EDITOR_SETTINGS_KEY]: JSON.stringify({ fontSize: 18 }) },
    network: { "*": server.serve },
  });
  await app.waitFor("id:file-entry-App.tsx");
  await app.press("id:nav-branch");
  await app.waitFor("id:git-diff-App.tsx");
  await app.press("id:git-diff-App.tsx");
  await app.waitFor("id:git-diff-view");
  expect(app.spanStyle("text:export const value = 1;").fontSize).toBe(18);
});

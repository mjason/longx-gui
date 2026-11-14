import { expect, open, test } from "nsh/test";
import { createUpdateState, type UpdateApi } from "./src/features/updates/updateState";
import { mockServer } from "./tests/fixtures/server";

function fixture(overrides: Partial<UpdateApi> = {}) {
  const calls: string[] = [];
  const api: UpdateApi = {
    supported: () => true,
    async checkForPackage() {
      calls.push("check-package");
      return { version: "0.1.1", build: 2 };
    },
    async checkForUpdate() {
      calls.push("check-app");
      return null;
    },
    async downloadPackage(progress) {
      calls.push("download-package");
      progress({ received: 25, total: 100 });
    },
    async downloadUpdate() {
      calls.push("download-app");
    },
    async restartToPackage() {
      calls.push("restart-package");
      throw new Error("blocked");
    },
    async installAndRestart() {
      calls.push("install-app");
      throw new Error("blocked");
    },
    ...overrides,
  };
  return { calls, state: createUpdateState(api) };
}
test("OTA is checked first; downloads and restarts require separate explicit actions", async () => {
  const { state, calls } = fixture();
  await state.check();
  expect(calls).toEqual(["check-package"]);
  expect(state.phase()).toBe("available");
  await state.download();
  expect(state.phase()).toBe("ready");
  expect(state.progress().received).toBe(25);
  await state.check();
  expect(calls).toEqual(["check-package", "download-package"]);
  await state.install();
  expect(state.phase()).toBe("ready");
  expect(calls).toContain("restart-package");
  expect(state.error()).toContain("无法应用更新");
});
test("a failed signature check is not bypassed by falling back to the app updater", async () => {
  const { state, calls } = fixture({
    async checkForPackage() {
      throw new Error("signature");
    },
  });
  await state.check();
  expect(state.phase()).toBe("error");
  expect(calls).toEqual([]);
  expect(state.candidate()).toBe(null);
});
test("duplicate checks are serialized and cannot overwrite the active update", async () => {
  let resolve!: (value: null) => void;
  const { state } = fixture({
    checkForPackage: () =>
      new Promise((done) => {
        resolve = done;
      }),
  });
  const checking = state.check();
  expect(state.busy()).toBe(true);
  await state.check();
  resolve(null);
  await checking;
  expect(state.busy()).toBe(false);
  expect(state.checked()).toBe(true);
});
test("native app update is the fallback; read-only installs are not downloaded", async () => {
  const { state, calls } = fixture({
    async checkForPackage() {
      return null;
    },
    async checkForUpdate() {
      return {
        version: "0.2.0",
        url: "https://github.com/mjason/longx-gui/releases",
        canInstall: false,
      };
    },
  });
  await state.check();
  expect(state.candidate()?.kind).toBe("app");
  await state.download();
  expect(calls).toEqual([]);
  expect(state.phase()).toBe("available");
});
test("a writable full app update uses the native download and installer after OTA fallback", async () => {
  const { state, calls } = fixture({
    async checkForPackage() {
      return null;
    },
    async checkForUpdate() {
      return {
        version: "0.2.0",
        url: "https://github.com/mjason/longx-gui/releases",
        canInstall: true,
      };
    },
  });
  await state.check();
  await state.download();
  expect(state.phase()).toBe("ready");
  expect(calls).toEqual(["download-app"]);
  await state.install();
  expect(calls).toEqual(["download-app", "install-app"]);
});
test("download verification failure never marks an update ready or installs it", async () => {
  const { state, calls } = fixture({
    async downloadPackage() {
      throw new Error("hash");
    },
  });
  await state.check();
  await state.download();
  expect(state.phase()).toBe("error");
  expect(state.candidate()).toBe(null);
  await state.install();
  expect(calls).toEqual(["check-package"]);
});
test("development mode does not make updater calls or report falsely up to date", async () => {
  const { state, calls } = fixture({ supported: () => false });
  await state.check();
  expect(state.phase()).toBe("unsupported");
  expect(state.checked()).toBe(false);
  expect(calls).toEqual([]);
});
test("update UI exposes progress and requires native restart confirmation", async () => {
  const app = await open("./tests/fixtures/UpdateHarness.tsx", { width: 800, height: 700 });
  await app.press("id:update-check");
  await app.waitFor("id:update-download");
  expect(app.count("id:update-restart")).toBe(0);
  await app.press("id:update-download");
  await app.waitFor("id:update-restart");
  app.onDialog(() => "稍后");
  await app.press("id:update-restart");
  expect(app.texts().some((value) => value.includes("restart-package"))).toBe(false);
  app.onDialog(() => "确认重启");
  await app.press("id:update-restart");
  await app.waitFor("text:无法应用更新或重启。请保存工作后重试，或从 GitHub 下载整包。");
  expect(app.texts()).toContain("check-package download-package restart-package");
});
test("settings contains a manual update entry with honest development status", async () => {
  const app = await open("./App.tsx", {
    platform: "macos",
    width: 1200,
    height: 850,
    network: { "*": mockServer },
  });
  await app.keyboard.press("mod+,");
  await app.waitFor("id:settings-updates-tab");
  await app.press("id:settings-updates-tab");
  await app.press("id:update-check");
  await app.waitFor("text:开发预览不执行在线升级。请在安装版中检查更新。");
});

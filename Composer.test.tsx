import { expect, open, test } from "nsh/test";
import { composerServer as server } from "./tests/fixtures/composer";

test("composer sends once, uses the app-owned POST session, and clears only accepted text", async () => {
  const app = await open("./tests/fixtures/ComposerHarness.tsx", {
    width: 1000,
    height: 700,
    network: { "*": server, "POST *": server },
  });
  await app.type("id:thread-input", "你好，检查一下。");
  await app.press("id:thread-send");
  await app.waitUntil(() => app.requests().some((request) => request.method === "POST"));
  await app.waitFor("text:已发送，正在同步会话…");
  expect(app.texts()).toContain("已提交，等待启动…");
  expect(app.requests().filter((request) => request.method === "POST").length).toBe(1);
  const request = app.requests().find((entry) => entry.method === "POST")!;
  expect(request.headers["x-csrf-token"]).toBe("fixture-csrf");
  expect(request.headers.cookie).toBe("fixture=session");
  expect(JSON.parse(request.body ?? "{}").variables.input).toEqual({
    threadId: "composer-t1",
    text: "你好，检查一下。",
  });
  expect(app.value("id:thread-input")).toBe("");
  await expect(app.press("id:thread-send")).rejects.toMatchObject({
    code: "ERR_NSH_TEST_DISABLED",
  });
  await app.press("id:turn");
  expect(app.texts()).toContain("正在运行");
  expect(app.count("id:composer-activity-spinner")).toBe(1);
  await app.type("id:thread-input", "运行时的下一条草稿");
  await app.press("id:thread-send");
  expect(app.count("id:composer-queue-0")).toBe(1);
  expect(app.requests().filter((request) => request.method === "POST").length).toBe(1);
});

test("drafts stay with their thread across switching and disconnection", async () => {
  const app = await open("./tests/fixtures/ComposerHarness.tsx", { network: { "*": server } });
  await app.type("id:thread-input", "第一条草稿");
  await app.press("id:switch");
  expect(app.value("id:thread-input")).toBe("");
  await app.type("id:thread-input", "第二条草稿");
  await app.press("id:switch");
  expect(app.value("id:thread-input")).toBe("第一条草稿");
  await app.press("id:offline");
  await expect(app.press("id:thread-send")).rejects.toMatchObject({
    code: "ERR_NSH_TEST_DISABLED",
  });
  expect(app.value("id:thread-input")).toBe("第一条草稿");
  await app.press("id:remount");
  expect(app.count("id:thread-input")).toBe(0);
  await app.press("id:remount");
  expect(app.value("id:thread-input")).toBe("第一条草稿");
});

test("a late acknowledgement cannot clear another thread or text typed during the request", async () => {
  const app = await open("./tests/fixtures/ComposerHarness.tsx", {
    clock: {},
    network: { "*": server, "POST *": (request) => ({ ...server(request), delay: 5000 }) },
  });
  await expect(app.press("id:thread-send")).rejects.toMatchObject({
    code: "ERR_NSH_TEST_DISABLED",
  });
  await app.type("id:thread-input", "发出这条");
  await app.press("id:thread-send");
  await expect(app.press("id:thread-send")).rejects.toMatchObject({
    code: "ERR_NSH_TEST_DISABLED",
  });
  await app.type("id:thread-input", "，下一条草稿");
  await app.press("id:switch");
  await app.type("id:thread-input", "另一个会话");
  await app.clock!.runFor(6000);
  expect(app.value("id:thread-input")).toBe("另一个会话");
  await app.press("id:switch");
  expect(app.value("id:thread-input")).toBe("发出这条，下一条草稿");
  expect(app.requests().filter((request) => request.method === "POST").length).toBe(1);
});

test("an uncertain send preserves the draft and requires explicit acknowledgement before retry", async () => {
  const app = await open("./tests/fixtures/ComposerHarness.tsx", {
    network: { "*": server, "POST *": () => ({ status: 503 }) },
  });
  await app.type("id:thread-input", "失败时保留");
  await app.submit("id:thread-input");
  await app.waitFor("id:thread-send-error");
  expect(app.value("id:thread-input")).toBe("失败时保留");
  await expect(app.press("id:thread-send")).rejects.toMatchObject({
    code: "ERR_NSH_TEST_DISABLED",
  });
  expect(app.requests().filter((request) => request.method === "POST").length).toBe(1);
  await app.press("id:thread-send-acknowledge");
  await app.press("id:thread-send");
  await app.waitUntil(
    () => app.requests().filter((request) => request.method === "POST").length === 2,
  );
});

test("a missing CSRF session never falls back to an unprotected send", async () => {
  const app = await open("./tests/fixtures/ComposerHarness.tsx", {
    network: { "*": () => ({ body: "<html>sign in required</html>" }), "POST *": server },
  });
  await app.type("id:thread-input", "不能绕过认证");
  await app.press("id:thread-send");
  await app.waitFor("id:thread-send-error");
  expect(app.requests().filter((request) => request.method === "POST").length).toBe(0);
  expect(app.value("id:thread-input")).toBe("不能绕过认证");
});

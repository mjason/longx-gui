import { expect, open, test } from "nsh/test";
import { mockServer } from "./tests/fixtures/server";

async function setup() {
  const app = await open("./tests/fixtures/ThreadHarness.tsx", {
    platform: "macos",
    width: 1000,
    height: 900,
    clock: {},
    network: { "*": mockServer },
  });
  await app.waitFor("id:thread-item-assistant-1");
  return app;
}
test("shows user and assistant images without a redundant user label", async () => {
  const app = await setup();
  expect(app.texts().includes("你")).toBe(false);
  await app.press("id:images");
  await app.waitFor("id:thread-image-image-user-1");
  expect(app.texts()).toContain("图后的文字");
  expect(app.texts().some((value) => value.includes("本轮仅显示文字"))).toBe(false);
});
test("renders native user/Markdown/tool records through the kernel channel and loads earlier history", async () => {
  const app = await setup();
  expect(app.texts()).toContain("topic:thread:kernel-t1 stopped:0 requests:0");
  expect(app.texts()).toContain("请检查这个项目。");
  expect(app.count("id:thread-user-avatar-user-1")).toBe(1);
  expect(app.texts()).toContain("检查结果");
  expect(app.texts()).toContain("const ready = true;");
  expect(app.count("id:thread-item-empty-reasoning")).toBe(0);
  expect(app.count("id:thread-toggle-tool-1")).toBe(0);
  expect(app.texts()).toContain("1 次工具活动 · 1 段思考");
  await app.press("id:thread-group-toggle-activity:tool-1");
  await app.press("id:thread-toggle-tool-1");
  expect(app.texts().some((value) => value.includes("M src/App.tsx"))).toBe(true);
  await app.press("id:thread-toggle-thought-1");
  expect(app.texts()).toContain("检查目录和测试状态。");
  await app.press("id:thread-earlier");
  await app.waitUntil(() => app.texts().some((value) => value.includes("requests:1")));
  await app.waitFor("id:thread-item-earlier-1");
  expect(app.count("id:thread-earlier")).toBe(0);
  expect(app.requests().every((request) => request.method === "GET")).toBe(true);
});
test("native activity groups stay collapsed on streaming updates and retain nested expansion", async () => {
  const app = await setup();
  await app.press("id:activity");
  await app.waitFor("text:2 次工具活动 · 2 段思考");
  expect(app.count("id:thread-toggle-tool-1")).toBe(0);
  expect(app.texts()).toContain("1 项失败");
  await app.press("id:thread-group-toggle-activity:tool-1");
  await app.waitFor("id:thread-toggle-tool-2");
  await app.press("id:thread-toggle-tool-1");
  expect(app.texts().some((value) => value.includes("M src/App.tsx"))).toBe(true);
  await app.press("id:thread-group-toggle-activity:tool-1");
  expect(app.count("id:thread-toggle-tool-1")).toBe(0);
  await app.press("id:thread-group-toggle-activity:tool-1");
  expect(app.texts().some((value) => value.includes("M src/App.tsx"))).toBe(true);
});
test("assistant identity appears once per turn, copies prose only and uses real file events", async () => {
  const app = await setup();
  expect(app.count("id:thread-identity-turn:turn-1")).toBe(1);
  await app.press("id:finish");
  await app.waitFor("id:thread-copy-turn:turn-1");
  expect(app.count("id:thread-identity-turn:turn-1")).toBe(1);
  expect(app.count("id:thread-file-src/real.ts")).toBe(1);
  expect(app.count("id:thread-file-../outside.ts")).toBe(0);
  await app.press("id:thread-copy-turn:turn-1");
  await app.waitFor("text:已复制");
  expect(app.clipboard()).toContain("调整完成。");
  expect(app.clipboard()).toContain("原生会话已经连接。");
  expect(app.clipboard()?.includes("M src/App.tsx")).toBe(false);
  expect(app.clipboard()?.includes("请检查这个项目。")).toBe(false);
  expect(app.texts().includes("验证通过")).toBe(false);
});
test("the reading layout follows both themes without resubscribing or losing grouped state", async () => {
  const app = await setup();
  const requests = app.requests().length;
  await app.press("id:thread-group-toggle-activity:tool-1");
  await app.press("id:theme");
  expect(app.spanStyle("text:Longx").color).toBe("#f8f8f2ff");
  expect(app.count("id:thread-toggle-tool-1")).toBe(1);
  expect(app.requests().length).toBe(requests);
  await app.press("id:theme");
  expect(app.spanStyle("text:Longx").color).toBe("#35332fff");
});
test("streams without duplicated text and reconnects from an authoritative snapshot", async () => {
  const app = await setup();
  await app.press("id:emit");
  await app.waitFor("text:实时增量回复。");
  expect(app.texts().filter((value) => value.includes("实时增量回复。")).length).toBe(1);
  await app.press("id:disconnect");
  expect(app.count("id:thread-item-assistant-1")).toBe(1);
  await app.press("id:reconnect");
  await app.waitFor("text:重连后的完整回复。");
  expect(app.texts().some((value) => value.includes("实时增量回复。"))).toBe(false);
  await app.press("id:pending");
  await app.waitFor("id:thread-pending");
  expect(app.texts()).toContain("等待你的回应");
});
test("switching threads leaves the old subscription and rejects its late events", async () => {
  const app = await setup();
  await app.press("id:switch");
  await app.waitFor("text:topic:thread:kernel-t2 stopped:1 requests:0");
  await app.press("id:late");
  await app.clock!.runFor(100);
  expect(app.texts().some((value) => value.includes("旧会话污染"))).toBe(false);
});

test("rejects cross-project thread metadata before subscribing", async () => {
  const app = await open("./tests/fixtures/ThreadHarness.tsx", {
    platform: "macos",
    width: 1000,
    height: 900,
    network: {
      "*": (request) => {
        if (request.url.includes("NativeThread"))
          return {
            body: {
              data: {
                getThread: {
                  id: "t1",
                  projectId: "another-project",
                  kernelThreadId: "private-thread",
                },
              },
            },
          };
        return mockServer(request);
      },
    },
  });
  await app.waitFor("id:thread-error");
  expect(app.texts()).toContain("会话不存在、不可访问或不属于当前项目。");
  expect(app.texts()).toContain("topic: stopped:0 requests:0");
  expect(app.count("id:thread-timeline")).toBe(0);
});

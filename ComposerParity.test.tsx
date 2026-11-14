import { expect, open, type StubRequest, test } from "nsh/test";
import { composerServer } from "./tests/fixtures/composer";

async function setup() {
  let accepted = 0;
  const server = (request: StubRequest) => {
    if (
      request.method === "POST" &&
      request.url.endsWith("/gql") &&
      JSON.parse(request.body || "{}").query.includes("NativeSendMessage")
    ) {
      const input = JSON.parse(request.body || "{}").variables.input;
      return {
        body: {
          data: {
            sendMessage: {
              id: `db-${accepted}`,
              threadId: input.threadId,
              kernelTurnId: `accepted-${++accepted}`,
            },
          },
        },
      };
    }
    return composerServer(request);
  };
  const app = await open("./tests/fixtures/ComposerHarness.tsx", {
    width: 1000,
    height: 850,
    platform: "macos",
    clock: {},
    network: { "*": server, "POST *": server },
  });
  await app.waitFor("text:pro");
  return app;
}
const writes = (app: Awaited<ReturnType<typeof setup>>) =>
  app
    .requests()
    .filter((request) => request.method === "POST" && request.url.endsWith("/gql"))
    .map((request) => JSON.parse(request.body || "{}"));

test("native model and effort choices use server data and reset incompatible effort on model changes", async () => {
  const app = await setup();
  await app.press("id:composer-model-trigger");
  await app.press("id:composer-model-sol");
  await app.press("id:composer-effort-trigger");
  await app.press("id:composer-effort-high");
  await app.type("id:thread-input", "指定模型和档位");
  await app.press("id:thread-send");
  await app.waitFor("text:已发送，正在同步会话…");
  expect(writes(app)[0].variables.input).toEqual({
    threadId: "composer-t1",
    text: "指定模型和档位",
    model: "sol",
    effort: "high",
  });
  await app.press("id:accepted");
  await app.press("id:finished");
  await app.press("id:composer-model-trigger");
  await app.press("id:composer-model-fast");
  expect(app.count("id:composer-effort-trigger")).toBe(0);
  await app.type("id:thread-input", "无推理档位的模型");
  await app.press("id:thread-send");
  await app.waitUntil(() => writes(app).length === 2);
  expect(writes(app)[1].variables.input).toEqual({
    threadId: "composer-t1",
    text: "无推理档位的模型",
    model: "fast",
  });
});

test("effort can override the inherited alias without forcing a concrete model selection", async () => {
  const app = await setup();
  await app.press("id:composer-effort-trigger");
  await app.press("id:composer-effort-high");
  await app.type("id:thread-input", "沿用别名，只调整档位");
  await app.press("id:thread-send");
  await app.waitUntil(() => writes(app).length === 1);
  expect(writes(app)[0].variables.input).toEqual({
    threadId: "composer-t1",
    text: "沿用别名，只调整档位",
    effort: "high",
  });
});

test("running messages queue without writes and drain only after a terminal turn", async () => {
  const app = await setup();
  await app.press("id:turn");
  await app.type("id:thread-input", "第一条排队");
  await app.press("id:thread-send");
  await app.waitFor("id:composer-queue-0");
  await app.type("id:thread-input", "第二条排队");
  await app.press("id:thread-send");
  expect(writes(app).length).toBe(0);
  expect(app.count("id:composer-queue-1")).toBe(1);
  await app.press("id:finished");
  await app.waitUntil(() => writes(app).length === 1);
  expect(writes(app)[0].variables.input.text).toBe("第一条排队");
  await app.press("id:accepted");
  expect(writes(app).length).toBe(1);
  await app.press("id:finished");
  await app.waitUntil(() => writes(app).length === 2);
  expect(writes(app)[1].variables.input.text).toBe("第二条排队");
});

test("immediate insertion uses steerTurn and stop pauses pending queued messages", async () => {
  const app = await setup();
  await app.press("id:turn");
  await app.type("id:thread-input", "请先处理这一条");
  await app.press("id:composer-insert");
  await app.waitUntil(() => writes(app).length === 1);
  expect(writes(app)[0].query).toContain("NativeSteerTurn");
  expect(writes(app)[0].variables.input.text).toBe("请先处理这一条");
});

test("stopping keeps the queue paused until the person explicitly resumes", async () => {
  const app = await setup();
  await app.press("id:turn");
  await app.type("id:thread-input", "停止后不要自行发送");
  await app.press("id:thread-send");
  await app.press("id:composer-stop");
  await app.waitUntil(() => writes(app).length === 1);
  expect(writes(app)[0].query).toContain("NativeInterruptTurn");
  await app.press("id:interrupted");
  await app.clock!.runFor(6000);
  expect(writes(app).length).toBe(1);
  await app.press("id:composer-resume-queue");
  await app.waitUntil(() => writes(app).length === 2);
  expect(writes(app)[1].variables.input.text).toBe("停止后不要自行发送");
});

test("an untouched own turn can be retracted into the draft instead of discarding its text", async () => {
  const app = await setup();
  await app.press("id:retractable");
  await app.press("id:turn");
  await app.type("id:thread-input", "已经在编辑的草稿");
  await app.press("id:composer-stop");
  await app.waitUntil(() => writes(app).length === 1);
  expect(writes(app)[0].query).toContain("NativeRetractTurn");
  expect(app.value("id:thread-input")).toBe("撤回原文\n\n已经在编辑的草稿");
});

test("a stopped turn without tool effects can be discarded and its original text restored", async () => {
  const app = await setup();
  await app.press("id:retractable");
  await app.press("id:turn");
  await app.press("id:interrupted");
  await app.press("id:composer-discard-stopped");
  await app.waitUntil(() => writes(app).length === 1);
  expect(writes(app)[0].query).toContain("NativeRetractTurn");
  expect(app.value("id:thread-input")).toBe("撤回原文");
});

test("mentions insert structured session directives and file paths rather than sending immediately", async () => {
  const app = await setup();
  await app.type("id:thread-input", "@main");
  await app.waitFor("id:composer-mention-result-0");
  await app.press("id:composer-mention-result-0");
  expect(app.value("id:thread-input")).toBe("@src/main.ts ");
  expect(writes(app).length).toBe(0);
});

test("slash commands create a new thread only on send and compact the existing thread", async () => {
  const app = await setup();
  await app.type("id:thread-input", "/compact");
  await app.submit("id:thread-input");
  await app.waitUntil(() => writes(app).length === 1);
  expect(writes(app)[0].query).toContain("NativeCompactThread");
  await app.type("id:thread-input", "/new");
  await app.submit("id:thread-input");
  expect(writes(app).length).toBe(1);
  await app.type("id:thread-input", "新会话的第一条");
  await app.press("id:thread-send");
  await app.waitUntil(() => writes(app).length === 3);
  expect(writes(app)[1].query).toContain("NativeStartThread");
  expect(writes(app)[2].variables.input.threadId).toBe("created-t1");
});

test("native pasted images can be sent without any typed text", async () => {
  const app = await setup();
  await app.paste("id:thread-input", { files: ["tests/fixtures/composer-image.png"] });
  await app.waitUntil(
    () =>
      app.count("id:composer-attachment-image.png") +
        app.count("id:composer-attachment-composer-image.png") >
      0,
  );
  await app.press("id:thread-send");
  await app.waitUntil(() => writes(app).length === 1);
  expect(writes(app)[0].variables.input.text).toBe("");
  expect(writes(app)[0].variables.input.images[0].startsWith("data:image/png;base64,")).toBe(true);
});

test("a goal command opens a native objective and budget dialog instead of sending the slash text", async () => {
  const app = await setup();
  await app.type("id:thread-input", "/goal");
  await app.submit("id:thread-input");
  await app.waitFor("id:composer-goal-objective");
  await app.type("id:composer-goal-objective", "完成测试目标");
  await app.type("id:composer-goal-budget", "3000");
  await app.press("id:composer-goal-save");
  await app.waitUntil(() => writes(app).length === 1);
  expect(writes(app)[0].query).toContain("NativeSetGoal");
  expect(writes(app)[0].variables.input).toEqual({
    threadId: "composer-t1",
    objective: "完成测试目标",
    tokenBudget: 3000,
  });
});

test("a selected session reference includes the Web recipient directive and excludes off-duty sessions", async () => {
  const app = await setup();
  await app.type("id:thread-input", "@other");
  await app.waitFor("id:composer-mention-result-0");
  expect(app.texts().includes("非当值")).toBe(false);
  await app.press("id:composer-mention-result-0");
  expect(app.value("id:thread-input")).toContain('@session("project:~other")');
  expect(app.value("id:thread-input")).toContain("成果接收会话");
  expect(writes(app).length).toBe(0);
});

test("mention completion takes arrow keys and Enter before sending, then releases the keyboard bindings", async () => {
  const app = await setup();
  await app.type("id:thread-input", "@main");
  await app.waitFor("id:composer-mention-result-1");
  await app.keyboard.press("down");
  await app.keyboard.press("enter");
  expect(app.value("id:thread-input")).toBe('@"docs/user guide.md" ');
  expect(writes(app).length).toBe(0);
  await app.keyboard.press("enter");
  await app.waitUntil(() => writes(app).length === 1);
  expect(writes(app)[0].variables.input.text).toBe('@"docs/user guide.md"');
});

test("Escape dismisses completion without clearing the text or sending a message", async () => {
  const app = await setup();
  await app.type("id:thread-input", "@main");
  await app.waitFor("id:composer-mention-result-0");
  await app.keyboard.press("escape");
  await app.waitUntil(() => app.count("id:composer-mention-result-0") === 0);
  expect(app.value("id:thread-input")).toBe("@main");
  expect(writes(app).length).toBe(0);
});

test("steer falls back to a normal send only when the server explicitly reports not_running", async () => {
  const app = await open("./tests/fixtures/ComposerHarness.tsx", {
    width: 1000,
    height: 850,
    network: {
      "*": composerServer,
      "POST *": (request) =>
        JSON.parse(request.body || "{}").query.includes("NativeSteerTurn")
          ? { body: { errors: [{ message: "not_running" }] } }
          : composerServer(request),
    },
  });
  await app.press("id:turn");
  await app.type("id:thread-input", "恰好已经结束的轮次");
  await app.press("id:composer-insert");
  await app.waitUntil(
    () => app.requests().filter((request) => request.method === "POST").length === 2,
  );
  expect(app.value("id:thread-input")).toBe("");
  const writes = app
    .requests()
    .filter((request) => request.method === "POST")
    .map((request) => JSON.parse(request.body || "{}"));
  expect(writes.length).toBe(2);
  expect(writes[0].query).toContain("NativeSteerTurn");
  expect(writes[1].query).toContain("NativeSendMessage");
});

test("a failed steer is retained without silently starting a second normal turn", async () => {
  const app = await open("./tests/fixtures/ComposerHarness.tsx", {
    width: 1000,
    height: 850,
    network: { "*": composerServer, "POST *": () => ({ status: 503 }) },
  });
  await app.press("id:turn");
  await app.type("id:thread-input", "不要重复发送");
  await app.press("id:composer-insert");
  await app.waitFor("id:thread-send-error");
  expect(app.value("id:thread-input")).toBe("不要重复发送");
  expect(app.requests().filter((request) => request.method === "POST").length).toBe(1);
});

test("queued sends wait for unreviewed wait-purpose jobs before starting another turn", async () => {
  let pending = true;
  const app = await open("./tests/fixtures/ComposerHarness.tsx", {
    width: 1000,
    height: 850,
    clock: {},
    network: {
      "*": (request) =>
        request.url.includes("NativeComposerWork")
          ? {
              body: {
                data: {
                  projectJobs: {
                    jobs: pending
                      ? [
                          {
                            threadId: "composer-t1",
                            purpose: "wait",
                            activity: "running",
                            review: null,
                          },
                        ]
                      : [],
                  },
                },
              },
            }
          : composerServer(request),
      "POST *": composerServer,
    },
  });
  await app.press("id:turn");
  await app.type("id:thread-input", "工作结束后才发送");
  await app.press("id:thread-send");
  await app.press("id:finished");
  await app.clock!.runFor(6000);
  expect(app.requests().filter((request) => request.method === "POST").length).toBe(0);
  pending = false;
  await app.clock!.runFor(6000);
  await app.waitUntil(() => app.requests().some((request) => request.method === "POST"));
  expect(app.requests().filter((request) => request.method === "POST").length).toBe(1);
});

test("pasting multiline text preserves line breaks and Enter submits it", async () => {
  const app = await setup();
  await app.paste("id:thread-input", { text: "第一行\n第二行" });
  expect(app.value("id:thread-input")).toBe("第一行\n第二行");
  expect(writes(app).length).toBe(0);
  await app.keyboard.press("enter");
  await app.waitUntil(() => writes(app).length === 1);
  expect(writes(app)[0].variables.input.text).toBe("第一行\n第二行");
});

test("server-side waiting messages can be inspected and released singly or together", async () => {
  const app = await open("./tests/fixtures/WaitingHarness.tsx", {
    width: 1000,
    height: 700,
    network: { "*": composerServer, "POST *": composerServer },
  });
  await app.press("id:composer-waiting-toggle");
  expect(app.texts()).toContain("另一会话发来的信息");
  await app.press("id:composer-release-waiting-1");
  await app.waitUntil(
    () => app.requests().filter((request) => request.method === "POST").length === 1,
  );
  await app.press("id:composer-release-all");
  await app.waitUntil(
    () => app.requests().filter((request) => request.method === "POST").length === 2,
  );
  const requests = app
    .requests()
    .filter((request) => request.method === "POST")
    .map((request) => JSON.parse(request.body || "{}"));
  expect(requests[0].variables.input).toEqual({ threadId: "composer-t1", waitingId: "waiting-1" });
  expect(requests[1].variables.input).toEqual({ threadId: "composer-t1" });
});

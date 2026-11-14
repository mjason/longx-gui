import type { StubRequest, StubResponse } from "nsh/test";

export function composerCatalog(threadId = "composer-t1", projectId = "composer-project") {
  return {
    listModels: [
      {
        slug: "sol",
        name: "Sol",
        default: false,
        contextWindow: 500000,
        reasoningLevels: ["low", "medium", "high"],
        reasoningEffort: "medium",
        provider: { name: "Fixture AI" },
      },
      {
        slug: "fast",
        name: "Fast",
        default: true,
        contextWindow: 64000,
        reasoningLevels: [],
        reasoningEffort: null,
        provider: { name: "Fixture AI" },
      },
    ],
    modelAliases: [
      {
        name: "pro",
        label: "高级",
        models: ["sol", "fast"],
        efforts: ["high", null],
        builtin: true,
      },
    ],
    defaultModelSetting: { name: "pro", slug: "sol", kind: "alias" },
    agentDefinition: { model: "pro", effort: "medium" },
    getThread: threadId
      ? { id: threadId, projectId, modelSlug: "pro", reasoningEffort: "low", status: "idle" }
      : null,
  };
}
export function composerRead(request: StubRequest): StubResponse | undefined {
  const url = new URL(request.url),
    document = url.searchParams.get("query") || "";
  const vars = JSON.parse(url.searchParams.get("variables") || "{}");
  if (document.includes("NativeComposerCatalog"))
    return { body: { data: composerCatalog(vars.hasThread ? vars.id : "", vars.projectId) } };
  if (document.includes("NativeComposerWork"))
    return { body: { data: { projectJobs: { jobs: [] } } } };
  if (document.includes("NativeMentionFiles"))
    return {
      body: {
        data: {
          searchFiles: [
            { path: "src/main.ts", fileName: "main.ts", matchType: "file" },
            { path: "docs/user guide.md", fileName: "user guide.md", matchType: "file" },
          ],
        },
      },
    };
  if (document.includes("NativeMentionSessions"))
    return {
      body: {
        data: {
          directory: {
            sessions: [
              {
                threadId: "other-thread",
                address: "~other",
                onDuty: true,
                state: "idle",
                title: "协作会话",
                preview: "",
                handle: "other",
                projectSlug: "project",
              },
              {
                threadId: "off-duty",
                address: "~off-duty",
                onDuty: false,
                state: "idle",
                title: "非当值",
                preview: "",
                handle: null,
                projectSlug: "project",
              },
            ],
          },
        },
      },
    };
  return undefined;
}
export function composerServer(request: StubRequest): StubResponse {
  const url = new URL(request.url),
    read = composerRead(request);
  if (read) return read;
  if (url.pathname === "/")
    return {
      body: '<meta name="csrf-token" content="fixture-csrf">',
      headers: { "set-cookie": "fixture=session; Path=/" },
    };
  if (url.pathname.startsWith("/attachments/"))
    return {
      body: { path: "/server/attachments/uploaded.bin", name: "uploaded.bin", bytes: 40000 },
    };
  if (request.method === "POST") {
    const { query, variables } = JSON.parse(request.body || "{}"),
      input = variables.input;
    if (query.includes("NativeSteerTurn"))
      return { body: { data: { steerTurn: { kernelTurnId: "steered-turn" } } } };
    if (query.includes("NativeInterruptTurn")) return { body: { data: { interruptTurn: true } } };
    if (query.includes("NativeRetractTurn"))
      return { body: { data: { retractTurn: { text: "撤回原文" } } } };
    if (query.includes("NativeStartThread"))
      return {
        body: {
          data: {
            startThread: {
              id: "created-t1",
              kernelThreadId: "kernel-created-t1",
              title: null,
              status: "idle",
              projectId: input.projectId,
            },
          },
        },
      };
    if (query.includes("NativeCompactThread")) return { body: { data: { compactThread: true } } };
    if (query.includes("NativeSetGoal"))
      return {
        body: {
          data: {
            setGoal: {
              objective: input.objective,
              tokenBudget: input.tokenBudget ?? null,
              status: "active",
            },
          },
        },
      };
    if (query.includes("NativeReleaseWaitingBatch"))
      return { body: { data: { releaseWaitingBatch: true } } };
    if (query.includes("NativeReleaseWaiting")) return { body: { data: { releaseWaiting: true } } };
    return {
      body: {
        data: {
          sendMessage: { id: "turn-db", threadId: input.threadId, kernelTurnId: "sent-turn" },
        },
      },
    };
  }
  return { status: 404 };
}

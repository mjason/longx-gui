export function threadSnapshot(threadId = "kernel-t1", seq = 10) {
  return {
    thread_id: threadId,
    seq,
    status: null,
    turn: { id: "turn-1", status: "inProgress", model: "test-model" },
    items: [
      {
        id: "user-1",
        type: "userMessage",
        turnId: "turn-1",
        content: [{ type: "text", text: "请检查这个项目。" }],
      },
      {
        id: "assistant-1",
        type: "agentMessage",
        turnId: "turn-1",
        text: "**检查结果**\n\n原生会话已经连接。\n\n```ts\nconst ready = true;\n```",
      },
      {
        id: "tool-1",
        type: "commandExecution",
        turnId: "turn-1",
        command: "git status --short",
        aggregatedOutput: "M src/App.tsx",
        exitCode: 0,
        status: "completed",
      },
      {
        id: "thought-1",
        type: "reasoning",
        turnId: "turn-1",
        summary: [
          "## 检查说明\n\n检查目录和测试状态。\n\n- **结构**保持清晰\n\n```ts\nconst checked = true;\n```",
        ],
        content: [],
      },
    ],
    pending_requests: [],
    earlier: { items: 1, turns: 1, partial: 0 },
  };
}

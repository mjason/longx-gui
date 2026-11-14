import { mount, signal, Text, View } from "nsh";
import { Button } from "nsh/base";
import type { subscribeChannel } from "../../src/api/channel";
import { ThreadPane } from "../../src/features/threads/ThreadPane";
import { createThemeState } from "../../src/theme/themes";
import { threadSnapshot } from "./thread";

function Harness() {
  const theme = createThemeState();
  const id = signal("t1"),
    topic = signal(""),
    stopped = signal(0),
    requests = signal(0);
  const mounted = signal(true);
  const viewStatus = signal("completed");
  let longSnapshot: ReturnType<typeof threadSnapshot> | null = null;
  let channel: Parameters<typeof subscribeChannel>[0], previous: typeof channel | undefined;
  const subscribe: typeof subscribeChannel = (options) => {
    previous = channel;
    channel = options;
    topic.set(options.topic);
    const timer = setTimeout(() => {
      options.ready(true);
      const data =
        longSnapshot?.thread_id === options.topic.slice(7)
          ? longSnapshot
          : threadSnapshot(options.topic.slice(7));
      options.joined(
        {
          ...data,
          items: [
            ...data.items,
            { id: "empty-reasoning", type: "reasoning", summary: [], content: [] },
          ],
        },
        false,
      );
    }, 0);
    return {
      stop() {
        clearTimeout(timer);
        stopped.set(stopped() + 1);
      },
      async request(event) {
        requests.set(requests() + 1);
        if (event === "snapshot") return threadSnapshot(options.topic.slice(7), 40);
        return {
          items: [
            {
              id: "earlier-1",
              type: "userMessage",
              content: [{ type: "text", text: "更早的一条消息" }],
            },
          ],
          earlier: { items: 0, turns: 0, partial: 0 },
        };
      },
    };
  };
  return (
    <View class="flex-1 pt-10 bg-background">
      <Text>{`topic:${topic()} stopped:${stopped()} requests:${requests()}`}</Text>
      <View class="h-10 px-3 flex-row items-center gap-2">
        <Button
          testID="remount-pane"
          class="h-8 px-3 rounded bg-accent"
          onPress={() => mounted.set(!mounted())}
        >
          <Text>切换面板</Text>
        </Button>
        <Button
          testID="long-process"
          class="h-8 px-3 rounded bg-accent"
          onPress={() => {
            longSnapshot = {
              ...threadSnapshot(),
              seq: 60,
              items: [
                {
                  id: "long-tool",
                  type: "commandExecution",
                  turnId: "turn-1",
                  exitCode: 0,
                  command: "长输出开头",
                  status: "completed",
                  aggregatedOutput: Array.from(
                    { length: 150 },
                    (_, i) => `过程输出第 ${i + 1} 行`,
                  ).join("\n"),
                },
              ],
            };
            channel.joined(longSnapshot, false);
          }}
        >
          <Text>长过程</Text>
        </Button>
        <Button
          testID="views"
          class="h-8 px-3 rounded bg-accent"
          onPress={() =>
            channel.joined(
              {
                ...threadSnapshot(),
                seq: 80,
                turn: { id: "turn-1", status: viewStatus() },
                items: [
                  {
                    id: "view-1",
                    type: "dynamicToolCall",
                    turnId: "turn-1",
                    namespace: "longx",
                    tool: "present",
                    status: viewStatus(),
                    success: true,
                    arguments: {
                      $type: "Card",
                      title: "会话内表格",
                      children: [
                        {
                          $type: "Table",
                          columns: [{ label: "检查" }, { label: "结果" }],
                          rows: [["渲染", "通过"]],
                        },
                      ],
                    },
                  },
                  {
                    id: "view-image-1",
                    type: "dynamicToolCall",
                    turnId: "turn-1",
                    namespace: "view_image",
                    tool: "view_image",
                    status: viewStatus(),
                    success: true,
                    details: {
                      attachment: true,
                      mime: "image/png",
                      path: "preview.png",
                      name: "预览图片",
                    },
                  },
                ],
              },
              false,
            )
          }
        >
          <Text>视图</Text>
        </Button>
        <Button testID="views-running" onPress={() => viewStatus.set("inProgress")}>
          <Text>视图运行</Text>
        </Button>
        <Button
          testID="views-finish"
          onPress={() =>
            channel.event("event", {
              seq: 81,
              method: "turn/completed",
              params: { turn: { id: "turn-1", status: "completed" } },
            })
          }
        >
          <Text>视图完成</Text>
        </Button>
        <Button
          testID="images"
          class="h-8 px-3 rounded bg-accent"
          onPress={() => {
            const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="180"><rect width="480" height="180" fill="#dbe4c8"/><circle cx="240" cy="90" r="48" fill="#708336"/></svg>')}`;
            channel.joined(
              {
                ...threadSnapshot(),
                seq: 50,
                items: [
                  {
                    id: "image-user",
                    type: "userMessage",
                    content: [
                      { type: "text", text: "看这张图" },
                      { type: "image", url: image, alt: "用户图片" },
                      { type: "text", text: "图后的文字" },
                    ],
                  },
                  { id: "image-assistant", type: "agentMessage", text: `![助手图片](${image})` },
                ],
              },
              false,
            );
          }}
        >
          <Text>图片</Text>
        </Button>
        <Button
          testID="finish"
          class="h-8 px-3 rounded bg-accent"
          onPress={() => {
            channel.event("event", {
              seq: 29,
              method: "item/completed",
              params: {
                item: {
                  id: "file-1",
                  type: "fileChange",
                  turnId: "turn-1",
                  status: "completed",
                  changes: [
                    { path: "src/real.ts", kind: "update" },
                    { path: "../outside.ts", kind: "update" },
                  ],
                },
              },
            });
            channel.event("event", {
              seq: 30,
              method: "item/completed",
              params: {
                item: {
                  id: "assistant-2",
                  type: "agentMessage",
                  turnId: "turn-1",
                  text: "调整完成。全部通过只是示例文字，不代表结构化验证状态。",
                },
              },
            });
            channel.event("event", {
              seq: 31,
              method: "turn/completed",
              params: {
                turn: {
                  id: "turn-1",
                  status: "completed",
                  model: "test-model",
                },
              },
            });
          }}
        >
          <Text>完成</Text>
        </Button>
        <Button
          testID="theme"
          class="h-8 px-3 rounded bg-accent"
          onPress={() => theme.select(theme.current().id === "light" ? "dark" : "light")}
        >
          <Text>主题</Text>
        </Button>
        <Button
          testID="activity"
          class="h-8 px-3 rounded bg-accent"
          onPress={() => {
            channel.event("event", {
              seq: 12,
              method: "item/completed",
              params: {
                item: {
                  id: "tool-2",
                  type: "commandExecution",
                  turnId: "turn-1",
                  command: "test",
                  status: "failed",
                  exitCode: 1,
                  aggregatedOutput: "failure",
                },
              },
            });
            channel.event("event", {
              seq: 13,
              method: "item/completed",
              params: {
                item: {
                  id: "thought-2",
                  type: "reasoning",
                  turnId: "turn-1",
                  summary: ["继续检查"],
                  content: [],
                },
              },
            });
          }}
        >
          <Text>活动</Text>
        </Button>
        <Button
          testID="emit"
          class="h-8 px-3 rounded bg-accent"
          onPress={() => {
            const event = {
              seq: 11,
              method: "item/agentMessage/delta",
              params: { itemId: "assistant-1", delta: "\n实时增量回复。" },
            };
            channel.event("event", event);
            channel.event("event", event);
          }}
        >
          <Text>增量</Text>
        </Button>
        <Button
          testID="disconnect"
          class="h-8 px-3 rounded bg-accent"
          onPress={() => {
            channel.ready(false);
            channel.error?.();
          }}
        >
          <Text>断线</Text>
        </Button>
        <Button
          testID="reconnect"
          class="h-8 px-3 rounded bg-accent"
          onPress={() => {
            channel.ready(true);
            const data = threadSnapshot(channel.topic.slice(7), 20);
            data.items[1].text = "重连后的完整回复。";
            channel.joined(data, true);
          }}
        >
          <Text>重连</Text>
        </Button>
        <Button
          testID="pending"
          class="h-8 px-3 rounded bg-accent"
          onPress={() =>
            channel.event("event", {
              seq: 21,
              method: "longx/action/request",
              params: { requestId: "r1", title: "确认" },
            })
          }
        >
          <Text>等待</Text>
        </Button>
        <Button testID="switch" class="h-8 px-3 rounded bg-accent" onPress={() => id.set("t2")}>
          <Text>换会话</Text>
        </Button>
        <Button
          testID="late"
          class="h-8 px-3 rounded bg-accent"
          onPress={() =>
            previous?.event("event", {
              seq: 99,
              method: "item/agentMessage/delta",
              params: { itemId: "assistant-1", delta: "旧会话污染" },
            })
          }
        >
          <Text>旧消息</Text>
        </Button>
      </View>
      <If when={mounted()}>
        <ThreadPane
          url="http://fixture.test"
          projectId="p1"
          threadId={id()}
          onFile={() => {}}
          subscribe={subscribe}
        />
      </If>
    </View>
  );
}
mount(Harness);

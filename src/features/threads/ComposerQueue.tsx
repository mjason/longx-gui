import { Scroll, Text, View } from "nsh";
import { AppButton as Button } from "../../components/AppButton";
import type { ComposerState } from "./composerState";

export function ComposerQueue(props: { state: ComposerState }) {
  return (
    <If when={props.state.draft()().queue.length > 0}>
      <View class="px-6 pt-2 pb-1 border-t border-border gap-1 bg-surface">
        <View class="flex-row items-center gap-2">
          <Text class="flex-1 text-xs text-quiet">
            {props.state.draft()().paused ? "队列已暂停" : "本轮及等待中的后台工作结束后发送"}
          </Text>
          <If when={props.state.draft()().paused}>
            <Button
              testID="composer-resume-queue"
              class="h-7 px-2 rounded hover:bg-accent"
              disabled={props.state.blocked()}
              onPress={() => void props.state.resume()}
            >
              <Text class="text-xs text-primary">继续队列</Text>
            </Button>
          </If>
        </View>
        <Scroll style={{ height: Math.min(136, props.state.draft()().queue.length * 36) }}>
          <View class="gap-1">
            <Each of={props.state.draft()().queue} key={(item) => item.id}>
              {(item, index) => (
                <View
                  testID={`composer-queue-${index()}`}
                  class="h-8 flex-row items-center gap-1 rounded bg-background px-2"
                >
                  <Text class="flex-1 text-xs text-foreground" style={{ numberOfLines: 1 }}>
                    {item().label}
                  </Text>
                  <Text class="text-xs text-quiet">
                    {item().status === "sending"
                      ? "发送中…"
                      : item().status === "uncertain"
                        ? "结果未确认"
                        : ""}
                  </Text>
                  <Button
                    accessibilityLabel="队列上移"
                    class="h-6 w-6 rounded hover:bg-accent"
                    disabled={index() === 0 || item().status !== "queued"}
                    onPress={() => props.state.moveQueued(item().id, -1)}
                  >
                    <Text class="text-xs text-quiet">↑</Text>
                  </Button>
                  <Button
                    accessibilityLabel="队列下移"
                    class="h-6 w-6 rounded hover:bg-accent"
                    disabled={
                      index() === props.state.draft()().queue.length - 1 ||
                      item().status !== "queued"
                    }
                    onPress={() => props.state.moveQueued(item().id, 1)}
                  >
                    <Text class="text-xs text-quiet">↓</Text>
                  </Button>
                  <Button
                    testID={`composer-insert-${index()}`}
                    class="h-6 px-2 rounded hover:bg-accent"
                    disabled={props.state.blocked() || item().status !== "queued"}
                    onPress={() => void props.state.insertQueued(item().id)}
                  >
                    <Text class="text-xs text-primary">立即插入</Text>
                  </Button>
                  <Button
                    testID={`composer-remove-queue-${index()}`}
                    accessibilityLabel="移除排队消息"
                    class="h-6 w-6 rounded hover:bg-accent"
                    disabled={item().status === "sending"}
                    onPress={() => props.state.removeQueued(item().id)}
                  >
                    <Text class="text-xs text-quiet">×</Text>
                  </Button>
                </View>
              )}
            </Each>
          </View>
        </Scroll>
      </View>
    </If>
  );
}

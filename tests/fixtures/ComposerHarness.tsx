import { batch, mount, signal, Text, View } from "nsh";
import { Button } from "nsh/base";
import { ThreadComposer } from "../../src/features/threads/ThreadComposer";
import { createThemeState } from "../../src/theme/themes";

function Harness() {
  const theme = createThemeState();
  const thread = signal("composer-t1"),
    ready = signal(true),
    running = signal(false),
    turn = signal("");
  const visible = signal(true);
  const status = signal("completed"),
    retractable = signal(false),
    command = signal("");
  let accepted = 0;
  return (
    <View class="flex-1 pt-10 bg-background">
      <View class="h-10 flex-row gap-2">
        <Button
          testID="switch"
          onPress={() => thread.set(thread() === "composer-t1" ? "composer-t2" : "composer-t1")}
        >
          <Text>换会话</Text>
        </Button>
        <Button testID="offline" onPress={() => ready.set(!ready())}>
          <Text>连接</Text>
        </Button>
        <Button
          testID="turn"
          onPress={() =>
            batch(() => {
              turn.set("sent-turn");
              running.set(!running());
              status.set(running() ? "inProgress" : "completed");
            })
          }
        >
          <Text>运行</Text>
        </Button>
        <Button
          testID="theme"
          onPress={() => theme.select(theme.current().id === "light" ? "dark" : "light")}
        >
          <Text>主题</Text>
        </Button>
        <Button testID="remount" onPress={() => visible.set(!visible())}>
          <Text>切换面板</Text>
        </Button>
        <Button
          testID="interrupted"
          onPress={() => {
            running.set(false);
            status.set("interrupted");
          }}
        >
          <Text>已停止</Text>
        </Button>
        <Button testID="retractable" onPress={() => retractable.set(!retractable())}>
          <Text>可撤回</Text>
        </Button>
        <Button
          testID="accepted"
          onPress={() =>
            batch(() => {
              turn.set(`accepted-${++accepted}`);
              running.set(true);
              status.set("inProgress");
            })
          }
        >
          <Text>收到轮次</Text>
        </Button>
        <Button
          testID="finished"
          onPress={() => {
            running.set(false);
            status.set("completed");
          }}
        >
          <Text>本轮结束</Text>
        </Button>
      </View>
      <View class="flex-1">
        <Text class="text-foreground">{thread()}</Text>
        <Text class="text-quiet">{`command:${command()}`}</Text>
      </View>
      <If when={visible()}>
        <ThreadComposer
          url="https://composer.example"
          projectId="composer-project"
          threadId={thread()}
          ready={ready()}
          running={running()}
          turnId={turn()}
          turnStatus={status()}
          turn={{ id: turn(), status: status() }}
          canRetract={retractable()}
          canDiscard={retractable()}
          tokenUsage={{ modelContextWindow: 100000, last: { totalTokens: 25000 } }}
          onCreated={(created) => thread.set(created.id)}
          onCommand={(value) => {
            command.set(value);
            if (value === "new") thread.set("");
          }}
        />
      </If>
    </View>
  );
}
mount(Harness);

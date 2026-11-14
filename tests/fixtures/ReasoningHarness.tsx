import { mount, signal, Text, View } from "nsh";
import { AppButton as Button } from "../../src/components/AppButton";
import { ReasoningView } from "../../src/features/threads/ReasoningView";
import type { ThreadItem } from "../../src/features/threads/threadModel";
import { createThemeState } from "../../src/theme/themes";

function Harness() {
  const theme = createThemeState();
  const summary = signal("**Checking repository status**"),
    active = signal(true),
    open = signal(true);
  const item = (): ThreadItem => ({ id: "reason", type: "reasoning", summary: [summary()] });
  return (
    <View class="flex-1 pt-12 bg-background">
      <View class="h-10 px-5 flex-row items-center gap-2">
        <Button
          testID="single"
          class="h-8 px-3 rounded bg-accent"
          onPress={() => summary.set("**Checking repository status**")}
        >
          <Text class="text-sm text-foreground">短摘要</Text>
        </Button>
        <Button
          testID="detail"
          class="h-8 px-3 rounded bg-accent"
          onPress={() => {
            summary.set(
              "## Checking repository status\n\n先检查 **工作区**，保留用户改动。\n\n- 查看 `git status`\n- 核对变更范围\n\n```sh\ngit diff --stat\n```\n\n再决定需要的验证。",
            );
            open.set(true);
          }}
        >
          <Text class="text-sm text-foreground">详细</Text>
        </Button>
        <Button
          testID="stream"
          class="h-8 px-3 rounded bg-accent"
          onPress={() => summary.set("**Checking repository")}
        >
          <Text class="text-sm text-foreground">流式</Text>
        </Button>
        <Button
          testID="theme"
          class="h-8 px-3 rounded bg-accent"
          onPress={() => theme.select(theme.current().id === "light" ? "dark" : "light")}
        >
          <Text class="text-sm text-foreground">主题</Text>
        </Button>
      </View>
      <View class="px-8 py-5 gap-3">
        <ReasoningView
          item={item()}
          open={open()}
          active={active()}
          onToggle={() => open.set(!open())}
          onCollapse={() => open.set(false)}
        />
      </View>
    </View>
  );
}
mount(Harness);

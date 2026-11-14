import { mount, View } from "nsh";
import { ComposerWaiting } from "../../src/features/threads/ComposerWaiting";
import { createThemeState } from "../../src/theme/themes";

function Harness() {
  createThemeState();
  return (
    <View class="flex-1 pt-10 bg-background">
      <ComposerWaiting
        url="https://composer.example"
        threadId="composer-t1"
        ready
        waiting={{
          paused: true,
          waiting: [
            { id: "waiting-1", text: "另一会话发来的信息", from: "~other", mine: false },
            { id: "waiting-2", text: "后台任务结果", source: "job:checks", mine: false },
          ],
        }}
      />
    </View>
  );
}
mount(Harness);

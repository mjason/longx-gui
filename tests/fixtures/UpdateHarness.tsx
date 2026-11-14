import { mount, signal, Text, View } from "nsh";
import { AppButton as Button } from "../../src/components/AppButton";
import { UpdatePanel } from "../../src/features/updates/UpdatePanel";
import { createUpdateState } from "../../src/features/updates/updateState";
import { createThemeState } from "../../src/theme/themes";

function Harness() {
  const theme = createThemeState();
  const mode = signal("package");
  const log = signal<string[]>([]);
  const note = (value: string) => log.update((all) => [...all, value]);
  const state = createUpdateState({
    supported: () => mode() !== "dev",
    async checkForPackage() {
      note("check-package");
      if (mode() === "error") throw new Error("bad signature");
      return mode() === "package" ? { version: "0.1.1", build: 2, notes: "改进会话体验。" } : null;
    },
    async checkForUpdate() {
      note("check-app");
      return {
        version: "0.2.0",
        url: "https://github.com/mjason/longx-gui/releases",
        canInstall: true,
      };
    },
    async downloadPackage(progress) {
      note("download-package");
      progress({ received: 1024, total: 1024 });
    },
    async downloadUpdate(progress) {
      note("download-app");
      progress({ received: 1024 });
    },
    async restartToPackage() {
      note("restart-package");
      throw new Error("fixture does not restart");
    },
    async installAndRestart() {
      note("install-app");
      throw new Error("fixture does not install");
    },
  });
  return (
    <View class="flex-1 pt-12 bg-background">
      <View class="flex-row items-center gap-2 px-4">
        <Each of={["package", "app", "error", "dev"]}>
          {(value) => (
            <Button
              testID={`mode-${value()}`}
              class="h-8 px-3 rounded bg-accent"
              onPress={() => mode.set(value())}
            >
              <Text class="text-sm text-foreground">{value()}</Text>
            </Button>
          )}
        </Each>
        <Button
          testID="theme"
          class="h-8 px-3 rounded bg-accent"
          onPress={() => theme.select(theme.current().id === "light" ? "dark" : "light")}
        >
          <Text class="text-sm text-foreground">主题</Text>
        </Button>
      </View>
      <View class="p-6">
        <UpdatePanel state={state} />
      </View>
      <Text testID="update-log" class="text-xs text-quiet">
        {log().join(" ")}
      </Text>
    </View>
  );
}
mount(Harness);

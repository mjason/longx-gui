import { openUrl, Text, View } from "nsh";
import { AlertDialog } from "nsh/base";
import { runningPackage, shellInfo } from "nsh/updater";
import config from "../../../nsh.json";
import { AppButton as Button } from "../../components/AppButton";
import type { UpdateState } from "./updateState";
import { appUpdates } from "./updates";

export const RELEASES_URL = "https://github.com/mjason/longx-gui/releases";
export function UpdatePanel(props: { state?: UpdateState }) {
  const state = props.state ?? appUpdates;
  const shell = shellInfo();
  const running = runningPackage();
  const canDownload = () => {
    const found = state.candidate();
    return found?.kind === "package" || (found?.kind === "app" && found.value.canInstall);
  };
  const status = () => {
    switch (state.phase()) {
      case "checking":
        return "正在检查签名 OTA 和应用整包更新…";
      case "available":
        return `发现新${state.candidate()?.kind === "package" ? " OTA " : "应用"}版本 ${state.candidate()?.value.version}`;
      case "downloading": {
        const { received, total } = state.progress();
        return total && total > 0
          ? `正在下载并校验… ${Math.min(100, Math.floor((received / total) * 100))}%`
          : `正在下载并校验… ${(received / 1024 / 1024).toFixed(1)} MiB`;
      }
      case "ready":
        return `版本 ${state.candidate()?.value.version} 已下载并验证，等待你确认重启。`;
      case "installing":
        return "正在应用更新并重启…";
      case "unsupported":
        return "开发预览不执行在线升级。请在安装版中检查更新。";
      case "error":
        return state.error();
      default:
        return state.checked() ? "当前已是最新版本。" : "尚未检查更新。";
    }
  };
  async function restart() {
    const answer = await AlertDialog.show({
      title: "应用更新并重启？",
      description:
        "应用将关闭并重启。未保存的编辑器内容、消息草稿和本机排队消息不会自动保存，请先处理好当前工作。",
      closeOnEscape: true,
      actions: [
        { id: "cancel", label: "稍后", role: "cancel" },
        { id: "restart", label: "确认重启" },
      ],
    });
    if (answer.action === "restart") await state.install();
  }
  return (
    <View testID="update-panel" class="gap-4">
      <Text class="text-lg font-medium text-foreground">Longx GUI</Text>
      <Text testID="update-version" class="text-sm text-muted-foreground">
        {`代码 ${running?.version ?? shell.version ?? config.version} · build ${running?.build ?? shell.build ?? config.build}`}
      </Text>
      <Text class="text-xs text-quiet">{`NSH ${shell.nshVersion} · ${shell.version ? `安装包 ${shell.version}` : "开发预览"}`}</Text>
      <View class="p-4 rounded border border-border bg-surface gap-3">
        <Text testID="update-status" class="text-sm text-foreground" style={{ lineHeight: 22 }}>
          {status()}
        </Text>
        <If when={state.phase() === "ready" && !!state.error()}>
          <Text class="text-xs text-destructive">{state.error()}</Text>
        </If>
        <If when={!!state.candidate()?.value.notes}>
          <Text
            class="text-sm text-muted-foreground"
            style={{ lineHeight: 22, userSelect: "text" }}
          >
            {state.candidate()?.value.notes}
          </Text>
        </If>
        <View class="flex-row flex-wrap items-center gap-2">
          <Button
            testID="update-check"
            disabled={state.busy() || state.phase() === "ready"}
            onPress={() => void state.check()}
            class="h-8 px-3 rounded bg-accent"
          >
            <Text class="text-sm text-primary">检查更新</Text>
          </Button>
          <If when={state.phase() === "available" && canDownload()}>
            <Button
              testID="update-download"
              onPress={() => void state.download()}
              class="h-8 px-3 rounded bg-primary"
            >
              <Text class="text-sm text-primary-foreground">下载更新</Text>
            </Button>
          </If>
          <If when={state.phase() === "ready"}>
            <Button
              testID="update-restart"
              onPress={() => void restart()}
              class="h-8 px-3 rounded bg-primary"
            >
              <Text class="text-sm text-primary-foreground">重启并应用</Text>
            </Button>
          </If>
        </View>
      </View>
      <Text class="text-xs text-muted-foreground" style={{ lineHeight: 20 }}>
        安装版启动后及每六小时检查一次；不自动下载或重启。OTA
        更新界面与逻辑，运行时升级需下载整包。只接受通过签名、版本和完整性校验的更新。
      </Text>
      <Button
        testID="update-releases"
        onPress={() => void openUrl(RELEASES_URL)}
        class="h-8 px-3 self-start rounded hover:bg-accent"
      >
        <Text class="text-sm text-primary">在 GitHub 查看发布记录</Text>
      </Button>
    </View>
  );
}

import { mount, platform, type ScrollRef, signal, View } from "nsh";
import { currentWindow } from "nsh/desktop";
import { ProjectSwitcher } from "./src/features/projects/ProjectSwitcher";
import { AddServerDialog } from "./src/features/servers/AddServerDialog";
import { ServerTabBar } from "./src/features/servers/ServerTabBar";
import { installApplicationMenu } from "./src/features/settings/applicationMenu";
import { createEditorSettings } from "./src/features/settings/editorSettings";
import { SettingsDialog } from "./src/features/settings/SettingsDialog";
import { WorkspaceLayout } from "./src/features/workspace/WorkspaceLayout";
import { createWorkspaceState } from "./src/state/workspace";
import { createThemeState } from "./src/theme/themes";

function App() {
  const theme = createThemeState();
  const workspace = createWorkspaceState();
  const adding = signal(false);
  const settingsOpen = signal(false);
  const settings = createEditorSettings();
  let scroll: ScrollRef | undefined;

  if (["macos", "windows", "linux"].includes(platform.os)) {
    currentWindow().set({ titleBar: { style: "hidden", height: 40 } });
    installApplicationMenu(() => {
      adding.set(false);
      settingsOpen.set(true);
    });
  }

  return (
    <View testID="app-root" class="flex-1 bg-background font-sans">
      <ServerTabBar
        servers={workspace.servers}
        selected={workspace.selectedServer}
        onSelect={workspace.selectServer}
        onClose={workspace.closeServer}
        onAdd={() => adding.set(true)}
        scrollRef={(value) => {
          scroll = value;
        }}
      />
      <If when={workspace.servers().length > 0}>
        <ProjectSwitcher
          projects={workspace.projects}
          selected={() => workspace.selectedProject()?.id}
          onSelect={workspace.selectProject}
          status={() =>
            workspace.connection()?.status === "loading"
              ? "正在读取项目…"
              : workspace.connection()?.status === "error"
                ? "连接失败"
                : "暂无项目"
          }
          onRefresh={workspace.refresh}
        />
      </If>
      <WorkspaceLayout
        workspace={workspace}
        theme={theme}
        settings={settings}
        onSettings={() => {
          adding.set(false);
          settingsOpen.set(true);
        }}
      />
      <If when={settingsOpen()}>
        <SettingsDialog settings={settings} onClose={() => settingsOpen.set(false)} />
      </If>
      <If when={adding()}>
        <AddServerDialog
          onClose={() => adding.set(false)}
          onAdd={(name, address) => {
            workspace.addServer(name, address);
            requestAnimationFrame(() => scroll?.scrollToEnd({ animated: true }));
          }}
        />
      </If>
    </View>
  );
}

mount(App);

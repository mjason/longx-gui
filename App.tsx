import { mount, platform, signal, View, type ScrollRef } from "nsh";
import { currentWindow } from "nsh/desktop";
import { ServerTabBar } from "./src/features/servers/ServerTabBar";
import { AddServerDialog } from "./src/features/servers/AddServerDialog";
import { ProjectSwitcher } from "./src/features/projects/ProjectSwitcher";
import { createWorkspaceState } from "./src/state/workspace";
import { WorkspaceLayout } from "./src/features/workspace/WorkspaceLayout";
import { createThemeState } from "./src/theme/themes";

function App() {
  const theme = createThemeState();
  const workspace = createWorkspaceState();
  const adding = signal(false);
  let scroll: ScrollRef | undefined;

  if (["macos", "windows", "linux"].includes(platform.os)) {
    currentWindow().set({ titleBar: { style: "hidden", height: 40 } });
  }

  return <View testID="app-root" class="flex-1 bg-background font-sans">
    <ServerTabBar servers={workspace.servers} selected={workspace.selectedServer}
      onSelect={workspace.selectServer} onClose={workspace.closeServer}
      onAdd={() => adding.set(true)} scrollRef={value => { scroll = value; }} />
    <If when={workspace.servers().length > 0}>
      <ProjectSwitcher projects={workspace.projects} selected={() => workspace.selectedProject()?.id} onSelect={workspace.selectProject}
        status={() => workspace.connection()?.status === "loading" ? "正在读取项目…" : workspace.connection()?.status === "error" ? "连接失败" : "暂无项目"}
        onRefresh={workspace.refresh} />
    </If>
    <WorkspaceLayout workspace={workspace} theme={theme} />
    <If when={adding()}>
      <AddServerDialog onClose={() => adding.set(false)} onAdd={(name, address) => {
        workspace.addServer(name, address);
        requestAnimationFrame(() => scroll?.scrollToEnd({ animated: true }));
      }} />
    </If>
  </View>;
}

mount(App);

import { mount, platform, signal, View, type ScrollRef } from "nsh";
import { currentWindow } from "nsh/desktop";
import { ServerTabBar } from "./src/features/servers/ServerTabBar";
import { AddServerDialog } from "./src/features/servers/AddServerDialog";
import { ProjectSwitcher } from "./src/features/projects/ProjectSwitcher";
import { createWorkspaceState } from "./src/state/workspace";

function App() {
  const workspace = createWorkspaceState();
  const adding = signal(false);
  let scroll: ScrollRef | undefined;

  if (["macos", "windows", "linux"].includes(platform.os)) {
    currentWindow().set({ titleBar: { style: "hidden", height: 40 } });
  }

  return <View testID="app-root" class="flex-1 bg-background">
    <ServerTabBar servers={workspace.servers} selected={workspace.selectedServer}
      onSelect={workspace.selectServer} onClose={workspace.closeServer}
      onAdd={() => adding.set(true)} scrollRef={value => { scroll = value; }} />
    <If when={workspace.servers().length > 0}>
      <ProjectSwitcher projects={[1, 2, 3]} selected={workspace.selectedProject} onSelect={workspace.selectProject} />
    </If>
    <View testID="empty-content" class="flex-1 bg-white" />
    <If when={adding()}>
      <AddServerDialog onClose={() => adding.set(false)} onAdd={(name, address) => {
        workspace.addServer(name, address);
        requestAnimationFrame(() => scroll?.scrollToEnd({ animated: true }));
      }} />
    </If>
  </View>;
}

mount(App);

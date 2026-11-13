import { token, effect, Scroll, signal, Text, View } from "nsh";
import { Icon } from "../../components/Icon";
import type { WorkspaceState } from "../../state/workspace";
import { PanelBar } from "./PanelBar";
import { createFileTreeState } from "../files/treeState";
import { ThemeMenu } from "../../theme/ThemeMenu";
import type { ThemeState } from "../../theme/themes";
import { createContentTabs } from "./contentTabs";
import { WorkspaceTabs } from "./WorkspaceTabs";
import { createDockState } from "./dockState";
import { DockSidebar } from "./DockSidebar";
import { ComposerPlaceholder } from "./ComposerPlaceholder";

export function WorkspaceLayout(props: { workspace: WorkspaceState; theme: ThemeState }) {
  const state = props.workspace;
  const dock = createDockState();
  const search = signal("");
  const width = signal(1280);
  const contentTabs = createContentTabs();
  const selectedFile = () => { const tab = contentTabs.current(); return tab?.kind === "file" ? tab.file : null; };
  const selectedThread = () => { const tab = contentTabs.current(); return tab?.kind === "chat" ? tab.thread : null; };
  const fileTree = createFileTreeState({
    serverUrl: () => state.currentServer()?.url,
    projectId: () => state.selectedProject()?.id,
    entries: () => state.workspaceData().files,
    search,
  });
  effect(() => {
    state.selectedServer();
    state.selectedProject()?.id;
    search.set("");
    contentTabs.reset();
  });
  const connectionText = () => !state.currentServer() ? "未连接"
    : state.connection()?.status === "ready" ? "已连接"
    : state.connection()?.status === "error" ? "连接失败" : "连接中…";
  return <View testID="workspace-layout" class="flex-1 bg-background font-sans"
    onLayout={event => width.set(event.bounds.size.width)}>
    <View class="flex-1 flex-row">
      <If when={dock.visible()}>
        <DockSidebar workspace={state} tree={fileTree} tabs={contentTabs} dock={dock} search={search} width={width} />
      </If>
      <View testID="workspace-main" class="flex-1">
        <WorkspaceTabs state={contentTabs} onToggleSidebar={dock.toggleSidebar} />
        <View testID="workspace-context" class="h-7 px-4 flex-row items-center gap-3 border-b border-border bg-background">
          <Text class="text-xs text-muted-foreground">{state.selectedProject()?.name ?? "未选择项目"}</Text>
          <Text class="text-xs text-quiet">/</Text>
          <Text class="flex-1 text-xs text-muted-foreground" style={{ numberOfLines: 1 }}>{selectedFile()?.path ?? "会话"}</Text>
          <If when={width() >= 900 && !selectedFile()}>
            <Text class="text-xs text-purple">Agent 尚未接入</Text>
          </If>
        </View>
        <Scroll testID="workspace-body" class="flex-1">
          <View class="px-9 py-7 gap-4">
            <If when={!state.currentServer()}>
              <Text class="text-base text-foreground">添加服务器开始使用</Text>
            </If>
            <If when={!!state.currentServer() && state.connection()?.status === "loading"}>
              <Text class="text-sm text-muted-foreground">正在连接服务器…</Text>
            </If>
            <If when={state.connection()?.status === "error"}>
              <Text class="text-sm text-destructive">{state.connection()?.error}</Text>
              <View testID="retry-connection" role="button" onPress={state.refresh} class="self-start px-4 py-2 rounded bg-accent">
                <Text class="text-sm text-primary">重新连接</Text>
              </View>
            </If>
            <If when={state.connection()?.status === "ready"}>
              <View class="flex-row items-center gap-2">
                <Icon name={selectedFile() ? "file" : "chat"} size={18} color={token("primary")} />
                <Text class="text-base font-medium text-foreground">{selectedFile()?.name ?? selectedThread()?.title ?? state.selectedProject()?.name ?? "暂无项目"}</Text>
              </View>
              <Text class="text-[13px] text-muted-foreground" style={{ numberOfLines: 1 }}>
                {selectedFile()?.path ?? state.selectedProject()?.rootPath ?? "服务器尚未创建项目"}
              </Text>
              <Text class="text-[13px] text-muted-foreground">
                {selectedFile() ? "文件预览将在后续接入" : selectedThread() ? "会话内容将在后续接入" : "从左侧选择文件或会话"}
              </Text>
            </If>
          </View>
        </Scroll>
        <If when={!!state.selectedProject() && !selectedFile()}><ComposerPlaceholder /></If>
      </View>
    </View>
    <View testID="workspace-status" class="h-6 px-2 flex-row items-center gap-3 border-t border-border bg-muted">
      <PanelBar selected={dock.selected} onSelect={dock.toggle} />
      <View class="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: state.connection()?.status === "ready" ? token("primary") : token("quiet") }} />
      <Text testID="connection-label" class="text-xs font-normal text-muted-foreground">{connectionText()}</Text>
      <Text class="flex-1 text-xs font-normal text-muted-foreground" style={{ numberOfLines: 1 }}>
        {width() < 900 ? state.currentServer()?.name ?? "" : state.currentServer()?.url ?? ""}
      </Text>
      <If when={width() >= 900}>
        <Text class="text-xs font-normal text-muted-foreground">{state.selectedProject()?.name ?? ""}</Text>
      </If>
      <ThemeMenu theme={props.theme} />
    </View>
  </View>;
}

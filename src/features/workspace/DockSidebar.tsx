import { Scroll, signal, Text, token, View, type Accessor, type Signal } from "nsh";
import { Input } from "nsh/base";
import { Icon } from "../../components/Icon";
import type { WorkspaceState } from "../../state/workspace";
import { FileTree } from "../files/FileTree";
import type { FileTreeState } from "../files/treeState";
import type { ContentTabsState } from "./contentTabs";
import type { DockState } from "./dockState";

export function DockSidebar(props: {
  workspace: WorkspaceState; tree: FileTreeState; tabs: ContentTabsState;
  dock: DockState; search: Signal<string>; width: Accessor<number>;
}) {
  const state = props.workspace;
  const dock = props.dock;
  const filtering = signal(props.search().length > 0);
  const rootExpanded = signal(true);
  return <View testID="workspace-sidebar" class="border-r border-border bg-sidebar"
    style={{ width: props.width() < 900 ? 220 : 248 }}>
    <If when={dock.files() || !!dock.auxiliary()}>
      <View testID="files-dock" class="flex-1">
        <View class="h-8 px-3 flex-row items-center gap-2 border-b border-border">
          <Text testID="sidebar-title" class="flex-1 text-[13px] text-foreground">
            {dock.auxiliary() === "branch" ? "Git" : dock.auxiliary() === "bot" ? "智能体" : "文件"}
          </Text>
          <If when={!dock.auxiliary()}>
            <View testID="search-files" role="button" accessibilityLabel="筛选已加载文件"
              onPress={() => { filtering.set(!filtering()); if (!filtering()) props.search.set(""); }}
              class="h-6 w-6 items-center justify-center rounded hover:bg-accent">
              <Icon name="search" size={15} />
            </View>
          </If>
          <View testID="close-sidebar" role="button" accessibilityLabel="收起侧栏" onPress={dock.close}
            class="h-6 w-6 items-center justify-center rounded hover:bg-accent">
            <Icon name="panel" size={15} />
          </View>
        </View>
        <If when={!!dock.auxiliary()}>
          <Text class="p-4 text-[13px] text-muted-foreground">
            {dock.auxiliary() === "branch" ? "Git" : "智能体"}功能将在后续接入。
          </Text>
        </If>
        <If when={!dock.auxiliary()}>
          <If when={filtering()}>
            <Input testID="sidebar-search" value={props.search()} onChange={event => props.search.set(event.value)}
              placeholder="筛选已加载文件…" class="h-7 mx-2 my-1 px-2 border border-border rounded bg-background text-[13px] text-foreground"
              style={{ placeholderColor: token("quiet") }} />
          </If>
          <View class="h-7 px-3 flex-row items-center gap-2">
            <View testID="file-root-toggle" role="button" onPress={() => rootExpanded.set(!rootExpanded())}
              accessibilityLabel="展开或收起项目目录" class="flex-1 flex-row items-center gap-2">
              <View class={rootExpanded() ? "rotate-90" : ""}><Icon name="chevron" size={12} /></View>
              <Icon name="folder" size={15} />
              <Text class="flex-1 text-[13px] text-ochre" style={{ numberOfLines: 1 }}>{state.selectedProject()?.name ?? "未选择项目"}</Text>
            </View>
            <View testID="refresh-workspace" role="button" accessibilityLabel="刷新工作区" onPress={state.refresh}
              class="h-6 px-1 justify-center rounded hover:bg-accent">
              <Text class="text-xs text-quiet">刷新</Text>
            </View>
          </View>
          <If when={!!state.selectedProject() && state.workspaceData().status === "loading"}>
            <Text class="p-3 text-[13px] text-muted-foreground">正在读取…</Text>
          </If>
          <If when={!!state.selectedProject() && state.workspaceData().status === "error"}>
            <Text class="p-3 text-xs text-destructive">{state.workspaceData().error}</Text>
          </If>
          <If when={rootExpanded() && state.workspaceData().status === "ready"}>
            <FileTree state={props.tree} onOpen={props.tabs.openFile} />
            <If when={props.tree.items().length === 0}>
              <Text class="p-3 text-[13px] text-muted-foreground">{props.search() ? "没有匹配的文件" : "目录为空"}</Text>
            </If>
          </If>
        </If>
      </View>
    </If>
    <If when={dock.chats()}>
      <View testID="conversations-dock" class="border-t border-border"
        style={{ flex: dock.files() || dock.auxiliary() ? undefined : 1, height: dock.files() || dock.auxiliary() ? "27%" : undefined, minHeight: 100 }}>
        <View class="h-8 px-3 flex-row items-center gap-2">
          <Text class="text-[13px] text-foreground">会话</Text>
          <Text class="flex-1 text-xs text-quiet">{state.workspaceData().threads.length}</Text>
          <View testID="close-chats" role="button" accessibilityLabel="收起会话列表" onPress={() => dock.chats.set(false)}
            class="h-6 w-6 items-center justify-center rounded hover:bg-accent">
            <View class="rotate-90"><Icon name="chevron" size={12} /></View>
          </View>
        </View>
        <Scroll class="flex-1 px-2 pb-2">
          <If when={!!state.selectedProject() && state.workspaceData().status === "loading"}>
            <Text class="p-2 text-xs text-muted-foreground">正在读取…</Text>
          </If>
          <If when={!!state.selectedProject() && state.workspaceData().status === "error"}>
            <Text class="p-2 text-xs text-destructive">{state.workspaceData().error}</Text>
          </If>
          <Each of={state.workspaceData().threads} key={thread => thread.id}>{thread =>
            <View testID={`thread-entry-${thread().id}`} role="button" onPress={() => props.tabs.openThread(thread())}
              class={props.tabs.active() === `chat:${thread().id}`
                ? "h-8 px-2 flex-row items-center gap-2 rounded bg-accent"
                : "h-8 px-2 flex-row items-center gap-2 rounded hover:bg-accent"}>
              <If when={props.tabs.active() === `chat:${thread().id}`}>
                <View class="absolute left-0 top-1 bottom-1 w-[2px] rounded bg-primary" />
              </If>
              <Icon name="chat" size={15} color={props.tabs.active() === `chat:${thread().id}` ? token("primary") : token("quiet")} />
              <Text class="flex-1 text-[13px] text-foreground" style={{ numberOfLines: 1 }}>{thread().title || "未命名会话"}</Text>
            </View>
          }</Each>
          <If when={state.workspaceData().status === "ready" && state.workspaceData().threads.length === 0}>
            <Text class="p-2 text-xs text-muted-foreground">暂无会话</Text>
          </If>
        </Scroll>
      </View>
    </If>
  </View>;
}

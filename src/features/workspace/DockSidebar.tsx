import { Scroll, type Signal, Text, token, View } from "nsh";
import { Input } from "nsh/base";
import { Icon } from "../../components/Icon";
import type { WorkspaceState } from "../../state/workspace";
import { FileTree } from "../files/FileTree";
import type { FileTreeState } from "../files/treeState";
import type { ContentTabsState } from "./contentTabs";

export function DockFiles(props: {
  workspace: WorkspaceState;
  tree: FileTreeState;
  tabs: ContentTabsState;
  search: Signal<string>;
  filtering: Signal<boolean>;
  rootExpanded: Signal<boolean>;
}) {
  const state = props.workspace;
  return (
    <View testID="files-dock" class="flex-1 bg-sidebar">
      <If when={props.filtering()}>
        <Input
          testID="sidebar-search"
          value={props.search()}
          onChange={(event) => props.search.set(event.value)}
          placeholder="筛选已加载文件…"
          class="h-7 mx-2 my-1 px-2 border border-border rounded bg-background text-[13px] text-foreground"
          style={{ placeholderColor: token("quiet") }}
        />
      </If>
      <If when={!!state.selectedProject() && state.workspaceData().status === "loading"}>
        <Text class="p-3 text-[13px] text-muted-foreground">正在读取…</Text>
      </If>
      <If when={!!state.selectedProject() && state.workspaceData().status === "error"}>
        <Text class="p-3 text-xs text-destructive">{state.workspaceData().error}</Text>
      </If>
      <If when={props.rootExpanded() && state.workspaceData().status === "ready"}>
        <FileTree state={props.tree} onOpen={props.tabs.openFile} />
        <If when={props.tree.items().length === 0}>
          <Text class="p-3 text-[13px] text-muted-foreground">
            {props.search() ? "没有匹配的文件" : "目录为空"}
          </Text>
        </If>
      </If>
    </View>
  );
}

export function DockConversations(props: { workspace: WorkspaceState; tabs: ContentTabsState }) {
  const state = props.workspace;
  return (
    <View testID="conversations-dock" class="flex-1 bg-sidebar">
      <Scroll class="flex-1 px-2 pb-2">
        <If when={!!state.selectedProject() && state.workspaceData().status === "loading"}>
          <Text class="p-2 text-xs text-muted-foreground">正在读取…</Text>
        </If>
        <If when={!!state.selectedProject() && state.workspaceData().status === "error"}>
          <Text class="p-2 text-xs text-destructive">{state.workspaceData().error}</Text>
        </If>
        <Each of={state.workspaceData().threads} key={(thread) => thread.id}>
          {(thread) => (
            <View
              testID={`thread-entry-${thread().id}`}
              role="button"
              onPress={() => props.tabs.openThread(thread())}
              class={
                props.tabs.active() === `chat:${thread().id}`
                  ? "h-8 px-2 flex-row items-center gap-2 rounded bg-accent"
                  : "h-8 px-2 flex-row items-center gap-2 rounded hover:bg-accent"
              }
            >
              <If when={props.tabs.active() === `chat:${thread().id}`}>
                <View class="absolute left-0 top-1 bottom-1 w-[2px] rounded bg-primary" />
              </If>
              <Icon
                name="chat"
                size={15}
                color={
                  props.tabs.active() === `chat:${thread().id}` ? token("primary") : token("quiet")
                }
              />
              <Text class="flex-1 text-[13px] text-foreground" style={{ numberOfLines: 1 }}>
                {thread().title || "未命名会话"}
              </Text>
            </View>
          )}
        </Each>
        <If
          when={
            state.workspaceData().status === "ready" && state.workspaceData().threads.length === 0
          }
        >
          <Text class="p-2 text-xs text-muted-foreground">暂无会话</Text>
        </If>
      </Scroll>
    </View>
  );
}

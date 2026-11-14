import { effect, type JSX, Scroll, Text, token, View } from "nsh";
import { AppButton as Button } from "../../components/AppButton";
import { Icon } from "../../components/Icon";
import type { WorkspaceState } from "../../state/workspace";
import { CodeEditor } from "../files/CodeEditor";
import { documentKey, type EditorState } from "../files/editorState";
import { GitDiffPane } from "../git/GitDiffPane";
import type { GitState } from "../git/gitState";
import type { EditorSettings } from "../settings/editorSettings";
import { ThreadComposer } from "../threads/ThreadComposer";
import { ThreadPane } from "../threads/ThreadPane";
import type { ContentTabsState } from "./contentTabs";

export function ContentPanel(props: {
  id: string;
  workspace: WorkspaceState;
  tabs: ContentTabsState;
  editor: EditorState;
  git: GitState;
  revision: number;
  settings: EditorSettings;
  onCommand?: (command: "new" | "git" | "files" | "settings") => void;
  projectHome?: () => JSX.Element;
  onProjectSettings?: () => void;
}) {
  const state = props.workspace;
  const tab = () => props.tabs.items().find((item) => item.id === props.id);
  const file = () => {
    const value = tab();
    return value?.kind === "file" ? value.file : null;
  };
  const diff = () => {
    const value = tab();
    return value?.kind === "diff" ? value.path : null;
  };
  const thread = () => {
    const value = tab();
    return value?.kind === "chat" ? value.thread : null;
  };
  const home = () => props.id !== "chat:new" && !!props.projectHome;
  const key = () =>
    documentKey(
      state.currentServer()?.url ?? "",
      state.selectedProject()?.id ?? "",
      file()?.path ?? "",
    );
  effect(() => {
    const value = file(),
      url = state.currentServer()?.url,
      projectId = state.selectedProject()?.id;
    if (value && url && projectId) void props.editor.load(url, projectId, value.path);
  });
  return (
    <View testID="workspace-main" class="flex-1 bg-background">
      <View
        testID="workspace-context"
        class="h-7 px-4 flex-row items-center gap-3 border-b border-border"
      >
        <Text class="text-xs text-muted-foreground">
          {state.selectedProject()?.name ?? "未选择项目"}
        </Text>
        <Text class="text-xs text-quiet">/</Text>
        <Text class="flex-1 text-xs text-muted-foreground" style={{ numberOfLines: 1 }}>
          {file()?.path ?? diff() ?? (home() && !thread() ? "项目主页" : "会话")}
        </Text>
        <If when={!!state.selectedProject() && !!props.onProjectSettings}>
          <Button
            testID="current-project-settings"
            class="h-6 px-2 gap-1 rounded hover:bg-accent"
            onPress={props.onProjectSettings}
          >
            <Icon name="settings" size={13} />
            <Text class="text-xs text-muted-foreground">项目设置</Text>
          </Button>
        </If>
      </View>
      <If when={!!file()}>
        <CodeEditor
          state={props.editor}
          documentKey={key()}
          settings={props.settings}
          onFocus={() => props.tabs.select(props.id)}
          active={props.tabs.active() === props.id}
        />
      </If>
      <If when={!!diff() && !!state.currentServer() && !!state.selectedProject()}>
        <GitDiffPane
          url={state.currentServer()!.url}
          projectId={state.selectedProject()!.id}
          path={diff()!}
          revision={props.revision + props.git.revision() + props.git.fileRevision(diff()!)}
          settings={props.settings}
          layout={props.git.diffLayout()}
          onLayoutChange={props.git.setDiffLayout}
          sourceDeleted={
            props.git
              .status()
              ?.changes.some((change) => change.path === diff() && change.status === "deleted") ??
            false
          }
          onOpenSource={() => {
            const path = diff();
            if (path) props.tabs.openFile({ path, name: path.split("/").pop() ?? path });
          }}
        />
      </If>
      <If when={!!thread() && !!state.currentServer() && !!state.selectedProject()}>
        <ThreadPane
          url={state.currentServer()!.url}
          projectId={state.selectedProject()!.id}
          threadId={thread()!.id}
          onFile={(path) => props.tabs.openFile({ path, name: path.split("/").pop() ?? path })}
          onCommand={props.onCommand}
        />
      </If>
      <If when={!file() && !diff() && !thread()}>
        <Scroll testID="workspace-body" class="flex-1">
          <View class="px-9 py-7 gap-4">
            <If when={home()}>{props.projectHome?.()}</If>
            <If when={!state.currentServer()}>
              <Text class="text-base text-foreground">添加服务器开始使用</Text>
            </If>
            <If when={!!state.currentServer() && state.connection()?.status === "loading"}>
              <Text class="text-sm text-muted-foreground">正在连接服务器…</Text>
            </If>
            <If when={state.connection()?.status === "error"}>
              <Text class="text-sm text-destructive">{state.connection()?.error}</Text>
              <Button
                testID="retry-connection"
                onPress={state.refresh}
                class="self-start h-8 px-4 items-center justify-center rounded bg-accent"
              >
                <Text class="text-sm text-primary text-center">重新连接</Text>
              </Button>
            </If>
            <If when={state.connection()?.status === "ready" && !home()}>
              <View class="flex-row items-center gap-2">
                <Icon name="chat" size={18} color={token("primary")} />
                <Text class="text-base font-medium text-foreground">
                  {thread()?.title ?? state.selectedProject()?.name ?? "暂无项目"}
                </Text>
              </View>
              <Text class="text-[13px] text-muted-foreground">
                {state.selectedProject()?.rootPath ?? "服务器尚未创建项目"}
              </Text>
              <Text class="text-[13px] text-muted-foreground">
                从左侧选择文件或会话，也可以直接发送开始新会话
              </Text>
            </If>
            <If when={state.connection()?.status === "ready" && home()}>
              <Text class="text-[13px] text-muted-foreground">
                从左侧选择文件或会话，或在当前项目开始新会话。
              </Text>
              <Button
                testID="home-new-thread"
                class="h-8 px-3 self-start rounded hover:bg-accent"
                disabled={!state.selectedProject()}
                onPress={props.tabs.openNewThread}
              >
                <Text class="text-sm text-primary">在当前项目开始新会话</Text>
              </Button>
            </If>
          </View>
        </Scroll>
        <If when={!!state.selectedProject() && !home()}>
          <ThreadComposer
            url={state.currentServer()?.url ?? ""}
            projectId={state.selectedProject()!.id}
            threadId=""
            ready={!!state.currentServer() && state.connection()?.status === "ready"}
            running={false}
            turnId=""
            onCommand={props.onCommand}
            onCreated={(created) => {
              props.tabs.close("chat:new");
              props.tabs.openThread(created);
              state.refresh();
            }}
          />
        </If>
      </If>
    </View>
  );
}

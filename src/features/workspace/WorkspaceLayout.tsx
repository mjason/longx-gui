import { computed, effect, keymap, platform, signal, Text, token, View } from "nsh";
import { AlertDialog } from "nsh/base";
import { currentWindow } from "nsh/desktop";
import { AppButton as Button } from "../../components/AppButton";
import { Icon } from "../../components/Icon";
import type { WorkspaceState } from "../../state/workspace";
import { ThemeMenu } from "../../theme/ThemeMenu";
import type { ThemeState } from "../../theme/themes";
import { createEditorState, documentKey } from "../files/editorState";
import { createFileTreeState } from "../files/treeState";
import { GitPanel } from "../git/GitPanel";
import { createGitState } from "../git/gitState";
import { treeDecorations } from "../git/treeDecorations";
import type { EditorSettings } from "../settings/editorSettings";
import { ContentPanel } from "./ContentPanel";
import { createContentTabs } from "./contentTabs";
import { DockConversations, DockFiles } from "./DockSidebar";
import { createDockState } from "./dockState";
import { PanelBar } from "./PanelBar";
import { WorkspaceDock } from "./WorkspaceDock";

export function WorkspaceLayout(props: {
  workspace: WorkspaceState;
  theme: ThemeState;
  settings: EditorSettings;
  onSettings: () => void;
}) {
  const state = props.workspace;
  const dock = createDockState();
  const search = signal("");
  const filtering = signal(false);
  const rootExpanded = signal(true);
  const width = signal(1280);
  const tabs = createContentTabs();
  const revision = signal(0);
  const editor = createEditorState(() => {
    revision.set(revision() + 1);
    void git.refresh();
  });
  const keyFor = (path: string) =>
    documentKey(state.currentServer()?.url ?? "", state.selectedProject()?.id ?? "", path);
  keymap.bind("mod+s", () => {
    const tab = tabs.current();
    if (tab?.kind === "file") void editor.save(keyFor(tab.file.path));
  });
  const git = createGitState({
    url: () => state.currentServer()?.url,
    projectId: () => state.selectedProject()?.id,
    enabled: () => !!state.selectedProject(),
    dirty: (path) => editor.dirty(keyFor(path)),
    onFiles: (paths) => {
      void tree.refreshPaths(paths);
    },
  });
  const decorations = computed(() => treeDecorations(git.status()?.changes ?? [], git.ignored()));
  let askingClose = false;
  async function closeTab(id: string) {
    const tab = tabs.items().find((item) => item.id === id);
    if (tab?.kind !== "file" || !editor.dirty(keyFor(tab.file.path))) {
      tabs.close(id);
      return;
    }
    if (askingClose) return;
    const key = keyFor(tab.file.path);
    askingClose = true;
    try {
      const saving = editor.documents()[key]?.saving;
      const answer = await AlertDialog.show({
        title: "未保存文件",
        description: saving
          ? "正在保存，请等待结果后再关闭。"
          : `${tab.file.path} 有未保存改动。草稿仅保留在本窗口，关闭前如何处理？`,
        closeOnEscape: true,
        actions: saving
          ? [{ id: "cancel", label: "取消", role: "cancel" }]
          : [
              { id: "save", label: "保存并关闭" },
              { id: "discard", label: "不保存并关闭", role: "destructive" },
              { id: "cancel", label: "取消", role: "cancel" },
            ],
      });
      if (keyFor(tab.file.path) !== key) return;
      if (answer.action === "discard") {
        editor.discard(key);
        tabs.close(id);
      }
      if (answer.action === "save") {
        await editor.save(key);
        if (keyFor(tab.file.path) === key && !editor.dirty(key)) tabs.close(id);
      }
    } finally {
      askingClose = false;
    }
  }
  const tree = createFileTreeState({
    serverUrl: () => state.currentServer()?.url,
    projectId: () => state.selectedProject()?.id,
    entries: () => state.workspaceData().files,
    search,
  });
  effect(() => {
    state.selectedServer();
    state.selectedProject()?.id;
    search.set("");
    tabs.reset();
  });
  if (["macos", "windows", "linux"].includes(platform.os)) {
    effect(() =>
      currentWindow().on("focusChange", ({ focused }) => {
        if (focused) void git.refresh(false);
      }),
    );
    effect(() => currentWindow().set({ closeOnPress: editor.dirtyCount() === 0 && !git.busy() }));
    currentWindow().on("closePress", async () => {
      if ((!editor.dirtyCount() && !git.busy()) || askingClose) return;
      askingClose = true;
      try {
        const busy = git.busy() || Object.values(editor.documents()).some((doc) => doc.saving);
        const answer = await AlertDialog.show({
          title: "关闭工作区",
          description: busy
            ? "操作正在进行，请等待结果后再关闭。"
            : "未保存草稿只保留在本窗口。关闭将丢失这些草稿。",
          closeOnEscape: true,
          actions: busy
            ? [{ id: "cancel", label: "返回工作区", role: "cancel" }]
            : [
                { id: "discard", label: "丢弃草稿并关闭", role: "destructive" },
                { id: "cancel", label: "返回工作区", role: "cancel" },
              ],
        });
        if (
          answer.action === "discard" &&
          !git.busy() &&
          !Object.values(editor.documents()).some((doc) => doc.saving)
        )
          currentWindow().close();
      } finally {
        askingClose = false;
      }
    });
  }
  const connectionText = () =>
    !state.currentServer()
      ? "未连接"
      : state.connection()?.status === "ready"
        ? "已连接"
        : state.connection()?.status === "error"
          ? "连接失败"
          : "连接中…";
  return (
    <View
      testID="workspace-layout"
      class="flex-1 bg-background font-sans"
      onLayout={(event) => width.set(event.bounds.size.width)}
    >
      <WorkspaceDock
        tabs={tabs}
        dock={dock}
        onClose={(id) => {
          void closeTab(id);
        }}
        projectName={state.selectedProject()?.name ?? "未选择项目"}
        conversationCount={state.workspaceData().threads.length}
        rootExpanded={rootExpanded}
        dirty={(path) => editor.dirty(keyFor(path))}
        onSearch={() => {
          filtering.set(!filtering());
          if (!filtering()) search.set("");
        }}
        renderPanel={(id) => {
          if (id === "files")
            return (
              <DockFiles
                workspace={state}
                tree={tree}
                tabs={tabs}
                search={search}
                filtering={filtering}
                rootExpanded={rootExpanded}
                decoration={(path) => decorations()(path)}
              />
            );
          if (id === "conversations") return <DockConversations workspace={state} tabs={tabs} />;
          if (id === "git")
            return (
              <GitPanel
                state={git}
                onDiff={tabs.openDiff}
                scope={JSON.stringify([state.currentServer()?.url, state.selectedProject()?.id])}
                projectName={state.selectedProject()?.name ?? "未选择项目"}
              />
            );
          if (id === "agent")
            return (
              <Text class="p-4 text-[13px] text-muted-foreground">智能体功能将在后续接入。</Text>
            );
          return (
            <ContentPanel
              id={id}
              workspace={state}
              tabs={tabs}
              editor={editor}
              git={git}
              revision={revision()}
              settings={props.settings}
              onCommand={(command) => {
                if (command === "new") tabs.openNewThread();
                else if (command === "settings") props.onSettings();
                else {
                  dock.open.set(true);
                  if (command === "git") dock.auxiliary.set("branch");
                  else {
                    dock.auxiliary.set(null);
                    dock.files.set(true);
                  }
                }
              }}
            />
          );
        }}
      />
      <View
        testID="workspace-status"
        class="h-6 px-2 flex-row items-center gap-3 border-t border-border bg-muted"
      >
        <PanelBar selected={dock.selected} onSelect={dock.toggle} />
        <Button
          testID="toggle-sidebar"
          accessibilityLabel="切换侧栏"
          onPress={dock.toggleSidebar}
          class="h-5 w-7 items-center justify-center rounded hover:bg-accent"
        >
          <Icon name="panel" size={15} />
        </Button>
        <View
          class="h-[6px] w-[6px] rounded-full"
          style={{
            backgroundColor:
              state.connection()?.status === "ready" ? token("primary") : token("quiet"),
          }}
        />
        <Text testID="connection-label" class="text-xs text-muted-foreground">
          {connectionText()}
        </Text>
        <Text class="flex-1 text-xs text-muted-foreground" style={{ numberOfLines: 1 }}>
          {width() < 900 ? (state.currentServer()?.name ?? "") : (state.currentServer()?.url ?? "")}
        </Text>
        <If when={width() >= 900}>
          <Text class="text-xs text-muted-foreground">{state.selectedProject()?.name ?? ""}</Text>
        </If>
        <ThemeMenu theme={props.theme} onSettings={props.onSettings} />
        <If when={editor.dirtyCount() > 0}>
          <Text class="text-xs text-ochre">草稿 {editor.dirtyCount()}</Text>
        </If>
      </View>
    </View>
  );
}

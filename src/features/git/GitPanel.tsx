import { effect, Scroll, signal, Text, View } from "nsh";
import { AlertDialog, Checkbox, Input, Tab, Tabs } from "nsh/base";
import { AppButton as Button } from "../../components/AppButton";
import { Icon } from "../../components/Icon";
import type { GitState } from "./gitState";

export function GitPanel(props: {
  state: GitState;
  onDiff: (path: string) => void;
  scope: string;
  projectName: string;
}) {
  const state = props.state;
  const message = signal("");
  const asking = signal(false);
  const section = signal<"changes" | "history">("changes");
  const focusedPath = signal("");
  const allSelected = () => {
    const paths = state.selectable(),
      chosen = new Set(state.selected());
    return paths.length > 0 && paths.every((path) => chosen.has(path));
  };
  const diffTarget = () =>
    state.status()?.changes.find((change) => change.path === focusedPath())?.path ??
    state.selected()[0] ??
    state.status()?.changes[0]?.path;
  function openDiff(path: string) {
    focusedPath.set(path);
    props.onDiff(path);
  }
  effect(() => {
    props.scope;
    message.set("");
    section.set("changes");
    focusedPath.set("");
  });
  async function confirmCommit() {
    if (asking() || !state.canCommit()) return;
    const scope = props.scope,
      paths = [...state.selected()],
      text = message();
    asking.set(true);
    try {
      const answer = await AlertDialog.show({
        title: "确认 Git 提交",
        description: `${props.projectName}：暂存并提交所选文件，不推送远端。\n\n${paths.join("\n")}\n\n${text}\n\n失败时暂存区可能已改变，请刷新核对。`,
        closeOnEscape: true,
        actions: [
          { id: "cancel", label: "取消", role: "cancel" },
          { id: "commit", label: "确认提交" },
        ],
      });
      if (
        answer.action === "commit" &&
        props.scope === scope &&
        state.canCommit() &&
        JSON.stringify(paths) === JSON.stringify(state.selected())
      )
        if ((await state.commit(text)) && props.scope === scope && message() === text)
          message.set("");
    } finally {
      asking.set(false);
    }
  }
  return (
    <View testID="git-panel" class="flex-1 bg-sidebar">
      <Tabs
        class="h-9 flex-row border-b border-border"
        indicatorClass="bottom-0 h-[2px] bg-primary"
      >
        <Tab
          testID="git-tab-changes"
          selected={section() === "changes"}
          onPress={() => section.set("changes")}
          class="group flex-1 items-center justify-center border-r border-border hover:bg-muted selected:bg-background"
        >
          <Text class="text-sm text-muted-foreground group-selected:text-foreground">变更</Text>
        </Tab>
        <Tab
          testID="git-tab-history"
          selected={section() === "history"}
          onPress={() => section.set("history")}
          class="group flex-1 items-center justify-center hover:bg-muted selected:bg-background"
        >
          <Text class="text-sm text-muted-foreground group-selected:text-foreground">历史</Text>
        </Tab>
      </Tabs>
      <View class="h-9 px-2 flex-row items-center gap-1 border-b border-border">
        <If when={section() === "changes"}>
          <Button
            testID="git-view-diff"
            disabled={!diffTarget() || state.loading()}
            onPress={() => {
              const path = diffTarget();
              if (path) openDiff(path);
            }}
            class="h-7 px-1 gap-1 rounded hover:bg-accent disabled:opacity-40"
          >
            <Text class="text-sm text-muted-foreground">±</Text>
            <Text class="text-xs text-foreground">查看差异</Text>
          </Button>
          <View class="flex-1" />
          <Button
            testID="git-select-all"
            accessibilityLabel="全选或取消选择提交文件"
            disabled={
              state.busy() ||
              state.loading() ||
              state.status()?.merging ||
              !state.selectable().length
            }
            onPress={state.selectAll}
            class="h-7 px-2 rounded border border-border hover:bg-accent disabled:opacity-40"
          >
            <Text class="text-xs text-foreground">{allSelected() ? "取消全选" : "全选提交"}</Text>
          </Button>
        </If>
        <If when={section() === "history"}>
          <Text class="flex-1 px-1 text-xs text-muted-foreground">最近 20 次提交</Text>
        </If>
        <Button
          testID="refresh-git"
          accessibilityLabel="刷新 Git"
          disabled={state.busy()}
          onPress={() => {
            void state.refresh();
          }}
          class="h-7 w-6 rounded hover:bg-accent"
        >
          <Text class="text-sm text-muted-foreground">↻</Text>
        </Button>
      </View>
      <If when={state.loading()}>
        <Text class="px-3 py-2 text-xs text-muted-foreground">正在读取 Git…</Text>
      </If>
      <If when={!!state.error()}>
        <Text class="p-3 text-xs text-destructive">{state.error()}</Text>
      </If>
      <If when={!!state.result()}>
        <Text testID="git-result" class="p-3 text-xs text-muted-foreground">
          {state.result()}
        </Text>
      </If>
      <If when={!!state.status() && !state.status()!.repository}>
        <Text class="p-3 text-sm text-muted-foreground">当前项目不是 Git 仓库。</Text>
      </If>
      <If when={!!state.status()?.repository}>
        <If when={state.status()!.merging}>
          <Text class="p-3 text-xs text-destructive">
            合并进行中，暂不支持提交，请先在外部处理合并。
          </Text>
        </If>
        <If when={section() === "changes"}>
          <View testID="git-changes-pane" class="flex-1 min-h-0">
            <If when={state.status()!.changes.length > 0}>
              <Text class="px-3 py-2 text-xs text-muted-foreground">
                {state.status()!.changes.length} 个变更 · 已选 {state.selected().length}
              </Text>
              <Scroll testID="git-changes-list" class="flex-1">
                <Each of={state.status()!.changes} key={(change) => change.path}>
                  {(change) => (
                    <View
                      class={
                        focusedPath() === change().path
                          ? "h-9 px-2 flex-row items-center gap-1 bg-accent"
                          : "h-9 px-2 flex-row items-center gap-1 hover:bg-muted"
                      }
                    >
                      <Checkbox
                        testID={`git-select-${change().path}`}
                        disabled={state.busy() || !state.eligible(change().path)}
                        checked={state.selected().includes(change().path)}
                        accessibilityLabel={`选择提交 ${change().path}`}
                        onChange={() => state.toggle(change().path)}
                        class="h-5 w-5 items-center justify-center disabled:opacity-30"
                        indicatorClass="h-5 w-5 border border-border rounded items-center justify-center"
                        indicator={
                          <Text class="text-xs text-primary">
                            {state.selected().includes(change().path) ? "✓" : ""}
                          </Text>
                        }
                      />
                      <Button
                        testID={`git-diff-${change().path}`}
                        onPress={() => openDiff(change().path)}
                        class="flex-1 min-w-0 h-8 px-1 gap-2 rounded"
                      >
                        <Icon name="file" size={14} />
                        <View class="flex-1 min-w-0">
                          <Text class="text-[12px] text-foreground" style={{ numberOfLines: 1 }}>
                            {change().path.split("/").pop()}
                          </Text>
                          <If when={change().path.includes("/")}>
                            <Text class="text-[10px] text-quiet" style={{ numberOfLines: 1 }}>
                              {change().path.slice(0, change().path.lastIndexOf("/"))}
                            </Text>
                          </If>
                        </View>
                        <Text
                          accessibilityLabel={change().status}
                          class={
                            change().status === "deleted"
                              ? "text-xs text-destructive"
                              : change().status === "untracked" || change().status === "added"
                                ? "text-xs text-primary"
                                : "text-xs text-ochre"
                          }
                        >
                          {change().status === "untracked"
                            ? "?"
                            : change().status.slice(0, 1).toUpperCase()}
                        </Text>
                      </Button>
                    </View>
                  )}
                </Each>
              </Scroll>
            </If>
            <If when={state.status()!.changes.length === 0}>
              <View testID="git-clean-state" class="flex-1 items-center justify-center px-3 gap-2">
                <Icon name="branch" size={24} />
                <Text class="text-sm text-muted-foreground">没有待提交的变更</Text>
                <Text class="text-xs text-quiet">工作区干净</Text>
              </View>
            </If>
          </View>
        </If>
        <If when={section() === "history"}>
          <Scroll testID="git-history-pane" class="flex-1">
            <Each of={state.history()}>
              {(entry) => (
                <View class="px-3 py-3 gap-1 border-b border-border">
                  <Text class="text-[12px] text-foreground" style={{ numberOfLines: 2 }}>
                    {entry().subject}
                  </Text>
                  <Text class="text-xs text-quiet">
                    {entry().sha.slice(0, 8)} · {entry().author}
                  </Text>
                  <Text class="text-xs text-quiet">
                    {typeof entry().at === "string" ? entry().at.slice(0, 10) : ""}
                  </Text>
                </View>
              )}
            </Each>
            <If when={!state.history().length}>
              <Text class="p-3 text-sm text-muted-foreground">暂无提交历史</Text>
            </If>
          </Scroll>
        </If>
        <View testID="git-commit-area" class="border-t border-border bg-background">
          <View class="h-8 px-3 flex-row items-center gap-2 border-b border-border bg-sidebar">
            <Icon name="branch" size={14} />
            <Text
              testID="git-branch"
              class="flex-1 text-xs text-foreground"
              style={{ numberOfLines: 1 }}
            >
              {state.status()?.branch ?? "游离 HEAD / 未创建提交"}
            </Text>
            <If
              when={
                typeof state.status()?.ahead === "number" ||
                typeof state.status()?.behind === "number"
              }
            >
              <Text class="text-xs text-muted-foreground">
                ↑{state.status()?.ahead ?? "—"} ↓{state.status()?.behind ?? "—"}
              </Text>
            </If>
          </View>
          <Input
            testID="git-message"
            accessibilityLabel="提交说明"
            multiline
            value={message()}
            onChange={(event) => message.set(event.value)}
            placeholder="提交说明"
            class="h-24 px-3 py-2 bg-background text-[13px] text-foreground"
            style={{ textAlignVertical: "top" }}
          />
          <View class="px-3 pb-2 flex-row justify-end">
            <Button
              testID="git-commit"
              disabled={asking() || !state.canCommit() || !message().trim()}
              onPress={() => {
                void confirmCommit();
              }}
              class="h-7 px-3 rounded border border-border bg-accent disabled:opacity-40"
            >
              <Text class="text-xs text-primary">
                {state.busy() ? "正在提交…" : `提交所选 ${state.selected().length} 个文件`}
              </Text>
            </Button>
          </View>
          <Text class="px-3 pb-2 text-[10px] text-quiet">
            确认后才暂存并提交，不推送。请先保存草稿；重命名／冲突需外部处理。
          </Text>
          <If when={!!state.history()[0]}>
            <Text
              testID="git-last-commit"
              class="px-3 py-2 text-xs text-muted-foreground border-t border-border bg-sidebar"
              style={{ numberOfLines: 1 }}
            >
              {state.history()[0]?.subject}
            </Text>
          </If>
        </View>
      </If>
    </View>
  );
}

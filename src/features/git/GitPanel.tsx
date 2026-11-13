import { effect, Scroll, signal, Text, View } from "nsh";
import { AlertDialog, Checkbox, Input } from "nsh/base";
import { AppButton as Button } from "../../components/AppButton";
import type { GitState } from "./gitState";

export function GitPanel(props: { state: GitState; onDiff: (path: string) => void; scope: string; projectName: string }) {
  const state = props.state;
  const message = signal("");
  const asking = signal(false);
  effect(() => { props.scope; message.set(""); });
  async function confirmCommit() {
    if (asking() || !state.canCommit()) return;
    const scope = props.scope, paths = [...state.selected()], text = message();
    asking.set(true);
    try {
      const answer = await AlertDialog.show({
        title: "确认 Git 提交",
        description: `${props.projectName}：暂存并提交所选文件，不推送远端。\n\n${paths.join("\n")}\n\n${text}\n\n失败时暂存区可能已改变，请刷新核对。`,
        closeOnEscape: true,
        actions: [{ id: "cancel", label: "取消", role: "cancel" }, { id: "commit", label: "确认提交" }],
      });
      if (answer.action === "commit" && props.scope === scope && state.canCommit() &&
        JSON.stringify(paths) === JSON.stringify(state.selected())) await state.commit(text);
    } finally { asking.set(false); }
  }
  return <View testID="git-panel" class="flex-1">
    <View class="h-8 px-3 flex-row items-center gap-2">
      <Text testID="git-branch" class="flex-1 text-xs text-purple">{state.status()?.branch ?? (state.status()?.repository ? "游离 HEAD / 未创建提交" : "Git")}</Text>
      <Button testID="refresh-git" disabled={state.busy()} onPress={() => { void state.refresh(); }}
        class="h-6 px-2 rounded hover:bg-accent"><Text class="text-xs text-muted-foreground">刷新</Text></Button>
    </View>
    <If when={state.loading()}><Text class="px-3 py-2 text-xs text-muted-foreground">正在读取 Git…</Text></If>
    <If when={!!state.error()}><Text class="p-3 text-xs text-destructive">{state.error()}</Text></If>
    <If when={!!state.result()}><Text testID="git-result" class="p-3 text-xs text-muted-foreground">{state.result()}</Text></If>
    <If when={!!state.status() && !state.status()!.repository}><Text class="p-3 text-sm text-muted-foreground">当前项目不是 Git 仓库。</Text></If>
    <If when={!!state.status()?.repository}>
      <Text class="px-3 py-1 text-xs text-muted-foreground">{state.status()!.changes.length} 个变更 · ↑{state.status()!.ahead ?? 0} ↓{state.status()!.behind ?? 0}</Text>
      <If when={state.status()!.merging}><Text class="p-3 text-xs text-destructive">合并进行中，暂不支持提交，请先在外部处理合并。</Text></If>
      <Scroll class="flex-1">
        <Each of={state.status()!.changes} key={change => change.path}>{change =>
          <View class="h-8 px-2 flex-row items-center gap-1">
            <Checkbox testID={`git-select-${change().path}`} disabled={state.busy() || !state.eligible(change().path)}
              checked={state.selected().includes(change().path)}
              accessibilityLabel={`选择提交 ${change().path}`} onChange={() => state.toggle(change().path)}
              class="h-5 w-5 items-center justify-center disabled:opacity-30"
              indicatorClass="h-5 w-5 border border-border rounded items-center justify-center"
              indicator={<Text class="text-xs text-primary">{state.selected().includes(change().path) ? "✓" : ""}</Text>} />
            <Button testID={`git-diff-${change().path}`} onPress={() => props.onDiff(change().path)}
              class="flex-1 h-7 px-1 flex-row items-center gap-2 rounded hover:bg-accent">
              <Text class="flex-1 text-[12px] text-foreground" style={{ numberOfLines: 1 }}>{change().path}</Text>
              <Text class="text-xs text-ochre">{change().status.slice(0, 1).toUpperCase()}</Text>
            </Button>
          </View>
        }</Each>
        <If when={state.status()!.changes.length === 0}><Text class="p-3 text-sm text-muted-foreground">工作区干净</Text></If>
        <Text class="px-3 pt-4 pb-2 text-xs text-muted-foreground">最近 20 次提交</Text>
        <Each of={state.history()}>{entry =>
          <View class="px-3 py-2 gap-1">
            <Text class="text-[12px] text-foreground" style={{ numberOfLines: 2 }}>{entry().subject}</Text>
            <Text class="text-xs text-quiet">{entry().sha.slice(0, 8)} · {entry().author}</Text>
          </View>
        }</Each>
      </Scroll>
      <View class="p-3 gap-2 border-t border-border">
        <Input testID="git-message" value={message()} onChange={event => message.set(event.value)}
          placeholder="提交说明" class="h-8 px-2 border border-border rounded bg-background text-[13px] text-foreground" />
        <Button testID="git-commit" disabled={asking() || !state.canCommit() || !message().trim()}
          onPress={() => { void confirmCommit(); }} class="h-8 items-center justify-center rounded bg-accent disabled:opacity-40">
          <Text class="text-xs text-primary">{state.busy() ? "正在提交…" : `提交所选 ${state.selected().length} 个文件`}</Text>
        </Button>
        <Text class="text-xs text-quiet">提交磁盘版本；请先保存草稿。重命名／冲突请先在外部处理。</Text>
      </View>
    </If>
  </View>;
}

import { effect, signal, Text, View } from "nsh";
import { DiffView } from "nsh/base";
import { AppButton as Button } from "../../components/AppButton";
import { gitDiff } from "../../api/git";

export function GitDiffPane(props: { url: string; projectId: string; path: string; revision: number }) {
  const result = signal<{ diff: string; binary: boolean } | null>(null);
  const error = signal(false);
  const retry = signal(0);
  effect(() => {
    const url = props.url, projectId = props.projectId, path = props.path;
    props.revision; retry();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let active = true;
    result.set(null); error.set(false);
    void gitDiff(url, projectId, path, controller.signal).then(value => { if (active) result.set(value); })
      .catch(() => { if (active) error.set(true); }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  });
  return <View testID="git-diff-pane" class="flex-1 bg-background">
    <Text class="h-7 px-3 text-xs text-muted-foreground">HEAD ↔ 磁盘工作区 · 不包含未保存草稿</Text>
    <If when={error()}>
      <Button testID="retry-diff" onPress={() => retry.set(retry() + 1)} class="m-3 h-8 px-3 self-start bg-accent">
        <Text class="text-sm text-destructive">差异读取失败，点击重试</Text>
      </Button>
    </If>
    <If when={!result() && !error()}><Text class="p-3 text-sm text-muted-foreground">正在读取差异…</Text></If>
    <If when={result()?.binary}><Text class="p-3 text-sm text-muted-foreground">二进制文件不支持文本差异。</Text></If>
    <If when={!!result() && !result()!.binary}>
      <If when={!result()!.diff}><Text class="p-3 text-sm text-muted-foreground">没有文本差异。</Text></If>
      <DiffView testID="git-diff-view" class="flex-1 bg-background text-foreground" patch={result()!.diff}
        language={props.path} layout="unified" fontSize={13} lineHeight={20}
        classes={{ gutter: "bg-sidebar", lineNumber: "text-quiet", lineAdded: "bg-primary/10", lineDeleted: "bg-destructive/10",
          wordAdded: "bg-primary/20", wordDeleted: "bg-destructive/20", line: "text-foreground" }} />
    </If>
  </View>;
}

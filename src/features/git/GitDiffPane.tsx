import { effect, signal, Text, View } from "nsh";
import { type DiffLineRange, DiffView, Tab, Tabs } from "nsh/base";
import { type GitFileVersions, gitFileVersions } from "../../api/git";
import { AppButton as Button } from "../../components/AppButton";
import { Icon } from "../../components/Icon";
import type { EditorSettings } from "../settings/editorSettings";
import type { DiffLayout } from "./gitState";

export function GitDiffPane(props: {
  url: string;
  projectId: string;
  path: string;
  revision: number;
  settings: EditorSettings;
  layout: DiffLayout;
  onLayoutChange: (value: DiffLayout) => void;
  onOpenSource: () => void;
  sourceDeleted: boolean;
}) {
  const result = signal<GitFileVersions | null>(null);
  const error = signal(false);
  const retry = signal(0);
  const stats = signal({ added: 0, deleted: 0 });
  const selectedLines = signal<DiffLineRange | null>(null);
  const rowHeight = () =>
    Math.round(props.settings.current().fontSize * props.settings.current().lineHeight);
  const pairedLines = () => {
    const range = selectedLines();
    if (props.layout !== "split" || !range) return [];
    return Array.from({ length: range.end - range.start + 1 }, (_, offset) => ({
      id: `paired-${range.side}-${range.start + offset}`,
      side: range.side,
      line: range.start + offset,
    }));
  };
  effect(() => {
    const url = props.url,
      projectId = props.projectId,
      path = props.path;
    props.revision;
    retry();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let active = true;
    result.set(null);
    selectedLines.set(null);
    stats.set({ added: 0, deleted: 0 });
    error.set(false);
    void gitFileVersions(url, projectId, path, controller.signal)
      .then((value) => {
        if (active) result.set(value);
      })
      .catch(() => {
        if (active) error.set(true);
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  });
  return (
    <View testID="git-diff-pane" class="flex-1 bg-background">
      <View class="h-9 px-3 flex-row items-center gap-3 border-b border-border bg-surface">
        <Text class="flex-1 text-xs text-muted-foreground" style={{ numberOfLines: 1 }}>
          HEAD ↔ 磁盘工作区 · 不含草稿
        </Text>
        <If when={!!result() && !result()?.binary}>
          <Text testID="git-diff-stats" class="text-xs text-muted-foreground">
            +{stats().added} −{stats().deleted}
          </Text>
        </If>
        <Button
          testID="diff-open-source"
          accessibilityLabel="打开源文件"
          disabled={props.sourceDeleted}
          onPress={props.onOpenSource}
          class="h-7 px-2 gap-1 rounded border border-border hover:bg-accent disabled:opacity-40"
        >
          <Icon name="file" size={14} />
          <Text class="text-xs text-foreground">
            {props.sourceDeleted ? "源文件已删除" : "打开源文件"}
          </Text>
        </Button>
        <Tabs
          class="flex-row h-7 rounded border border-border"
          indicatorClass="inset-y-0 rounded bg-accent"
        >
          <Tab
            testID="diff-layout-split"
            selected={props.layout === "split"}
            onPress={() => props.onLayoutChange("split")}
            class="group px-2 items-center justify-center"
          >
            <Text class="text-xs text-muted-foreground group-selected:text-foreground">左右</Text>
          </Tab>
          <Tab
            testID="diff-layout-unified"
            selected={props.layout === "unified"}
            onPress={() => props.onLayoutChange("unified")}
            class="group px-2 items-center justify-center"
          >
            <Text class="text-xs text-muted-foreground group-selected:text-foreground">上下</Text>
          </Tab>
        </Tabs>
      </View>
      <If when={error()}>
        <Button
          testID="retry-diff"
          onPress={() => retry.set(retry() + 1)}
          class="m-3 h-8 px-3 self-start bg-accent"
        >
          <Text class="text-sm text-destructive">差异读取失败，点击重试</Text>
        </Button>
      </If>
      <If when={!result() && !error()}>
        <Text class="p-3 text-sm text-muted-foreground">正在读取差异…</Text>
      </If>
      <If when={result()?.binary}>
        <Text class="p-3 text-sm text-muted-foreground">二进制文件不支持文本差异。</Text>
      </If>
      <If when={!!result() && !result()!.binary}>
        <If when={(result()!.before ?? "") === (result()!.after ?? "")}>
          <Text class="p-3 text-sm text-muted-foreground">没有文本差异。</Text>
        </If>
        <View
          testID={`diff-mode-${props.layout}`}
          class="h-6 flex-row border-b border-border bg-sidebar"
        >
          <View class="flex-1 px-3 justify-center">
            <Text class="text-xs text-muted-foreground">
              {props.layout === "split" ? "HEAD · 旧版本" : "HEAD → 工作区 · 合并显示"}
            </Text>
          </View>
          <If when={props.layout === "split"}>
            <View class="flex-1 px-3 justify-center border-l border-border">
              <Text class="text-xs text-muted-foreground">工作区 · 新版本</Text>
            </View>
          </If>
        </View>
        <DiffView
          testID="git-diff-view"
          class="flex-1 bg-background text-foreground"
          oldValue={result()!.before ?? ""}
          newValue={result()!.after ?? ""}
          expandAll
          softWrap={false}
          language={props.path}
          layout={props.layout}
          onLineSelectionChange={(event) => selectedLines.set(event.range)}
          annotations={pairedLines()}
          // A zero-height native annotation is anchored below its real diff row.
          // Drawing back over that row spans both aligned sides, including filler,
          // without reconstructing line mappings or adding space to the content.
          styles={{ annotation: { left: 0, width: "100%", height: 0, pointerEvents: "none" } }}
          renderAnnotation={(annotation) => (
            <View
              testID={`diff-paired-line-${annotation.side}-${annotation.line}`}
              class="absolute left-0 right-0 bg-primary/10 border-t border-b border-primary/40"
              style={{ top: -rowHeight(), height: rowHeight(), pointerEvents: "none" }}
            />
          )}
          onStatsChange={(event) =>
            stats.set({ added: event.stats.added, deleted: event.stats.deleted })
          }
          fontFamily={props.settings.current().fontFamily}
          fontSize={props.settings.current().fontSize}
          lineHeight={rowHeight()}
          classes={{
            gutter: "bg-sidebar",
            lineNumber: "text-quiet",
            lineAdded: "bg-primary/10",
            lineDeleted: "bg-destructive/10",
            wordAdded: "bg-primary/20",
            wordDeleted: "bg-destructive/20",
            line: "text-foreground",
            lineSelected: props.layout === "split" ? "bg-transparent" : "bg-primary/15",
          }}
        />
      </If>
    </View>
  );
}

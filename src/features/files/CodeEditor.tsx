import { keymap, Text, View } from "nsh";
import { Editor } from "nsh/base";
import { AppButton as Button } from "../../components/AppButton";
import type { EditorState } from "./editorState";

export function CodeEditor(props: { state: EditorState; documentKey: string; onFocus?: () => void }) {
  const doc = () => props.state.documents()[props.documentKey];
  return <View testID="code-editor-pane" class="flex-1 bg-background">
    <If when={!!doc()}>
      <View class="h-8 px-3 flex-row items-center gap-3 border-b border-border bg-surface">
        <Text testID="editor-save-state" class="flex-1 text-xs text-muted-foreground">
          {doc().saving ? "正在保存…" : props.state.dirty(props.documentKey) ? "未保存"
            : doc().status === "loading" ? "正在读取…" : doc().status === "error" ? "读取失败" : "已同步"}
        </Text>
        <Button testID="reload-file" disabled={doc().status === "loading" || doc().saving || props.state.dirty(props.documentKey)}
          onPress={() => { void props.state.load(doc().url, doc().projectId, doc().path, true); }}
          class="h-6 px-2 rounded hover:bg-accent"><Text class="text-xs text-muted-foreground">重读</Text></Button>
        <Button testID="save-file" disabled={!props.state.dirty(props.documentKey) || doc().saving || doc().binary || doc().truncated}
          onPress={() => { void props.state.save(props.documentKey); }}
          class="h-6 px-2 rounded bg-accent disabled:opacity-40"><Text class="text-xs text-primary">保存 · {keymap.label("mod+s")}</Text></Button>
      </View>
      <If when={!!doc().error}><Text testID="editor-error" class="p-3 text-xs text-destructive">{doc().error}</Text></If>
      <If when={doc().status === "loading"}><Text class="p-4 text-sm text-muted-foreground">正在读取文件…</Text></If>
      <If when={doc().status === "error"}>
        <Button testID="retry-file" onPress={() => { void props.state.load(doc().url, doc().projectId, doc().path, true); }}
          class="m-3 h-8 px-3 self-start bg-accent rounded"><Text class="text-sm text-primary">重试读取</Text></Button>
      </If>
      <If when={doc().status === "ready" && doc().binary}>
        <Text class="p-4 text-sm text-muted-foreground">二进制文件不支持文本编辑。</Text>
      </If>
      <If when={doc().status === "ready" && !doc().binary}>
        <If when={doc().truncated}><Text class="p-3 text-xs text-ochre">文件过大，仅显示截断预览，禁止保存。</Text></If>
        <Editor testID="file-editor" accessibilityLabel={doc().path} class="flex-1 bg-background text-foreground"
          onFocus={props.onFocus}
          value={doc().text} language={doc().path} readOnly={doc().truncated || doc().saving}
          onChange={event => props.state.edit(props.documentKey, event.value)}
          fontSize={13} lineHeight={20} scrollBeyondLastLine={false}
          classes={{ gutter: "bg-sidebar", lineNumber: "text-quiet", activeLine: "bg-muted",
            selection: "bg-accent", caret: "bg-primary", indentGuide: "bg-border" }} />
      </If>
    </If>
  </View>;
}

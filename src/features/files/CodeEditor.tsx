import { keymap, Text, View } from "nsh";
import { Editor, type EditorRef } from "nsh/base";
import { AppButton as Button } from "../../components/AppButton";
import type { EditorSettings } from "../settings/editorSettings";
import type { EditorState } from "./editorState";

export function CodeEditor(props: {
  state: EditorState;
  documentKey: string;
  settings: EditorSettings;
  onFocus?: () => void;
  active?: boolean;
}) {
  const doc = () => props.state.documents()[props.documentKey];
  const preferences = props.settings.current;
  let editor: EditorRef | undefined;
  let editorKey = props.documentKey,
    measurement = 0;
  function rememberOffset() {
    const key = editorKey,
      ref = editor,
      generation = ++measurement;
    if (ref)
      void ref
        .scrollOffset()
        .then((offset) => {
          if (editor === ref && generation === measurement)
            props.state.rememberView(key, { offset });
        })
        .catch(() => {});
  }
  return (
    <View testID="code-editor-pane" class="flex-1 bg-background">
      <If when={!!doc()}>
        <View class="h-8 px-3 flex-row items-center gap-3 border-b border-border bg-surface">
          <Text testID="editor-save-state" class="flex-1 text-xs text-muted-foreground">
            {doc().saving
              ? "正在保存…"
              : props.state.dirty(props.documentKey)
                ? "未保存"
                : doc().status === "loading"
                  ? "正在读取…"
                  : doc().status === "error"
                    ? "读取失败"
                    : "已同步"}
          </Text>
          <Button
            testID="reload-file"
            disabled={
              doc().status === "loading" || doc().saving || props.state.dirty(props.documentKey)
            }
            onPress={() => {
              void props.state.load(doc().url, doc().projectId, doc().path, true);
            }}
            class="h-6 px-2 rounded hover:bg-accent"
          >
            <Text class="text-xs text-muted-foreground">重读</Text>
          </Button>
          <Button
            testID="save-file"
            disabled={
              !props.state.dirty(props.documentKey) ||
              doc().saving ||
              doc().binary ||
              doc().truncated
            }
            onPress={() => {
              void props.state.save(props.documentKey);
            }}
            class="h-6 px-2 rounded bg-accent disabled:opacity-40"
          >
            <Text class="text-xs text-primary">保存 · {keymap.label("mod+s")}</Text>
          </Button>
        </View>
        <If when={!!doc().error}>
          <Text testID="editor-error" class="p-3 text-xs text-destructive">
            {doc().error}
          </Text>
        </If>
        <If when={doc().status === "loading"}>
          <Text class="p-4 text-sm text-muted-foreground">正在读取文件…</Text>
        </If>
        <If when={doc().status === "error"}>
          <Button
            testID="retry-file"
            onPress={() => {
              void props.state.load(doc().url, doc().projectId, doc().path, true);
            }}
            class="m-3 h-8 px-3 self-start bg-accent rounded"
          >
            <Text class="text-sm text-primary">重试读取</Text>
          </Button>
        </If>
        <If when={doc().status === "ready" && doc().binary}>
          <Text class="p-4 text-sm text-muted-foreground">二进制文件不支持文本编辑。</Text>
        </If>
        <If when={doc().status === "ready" && !doc().binary}>
          <If when={doc().truncated}>
            <Text class="p-3 text-xs text-ochre">文件过大，仅显示截断预览，禁止保存。</Text>
          </If>
          <Editor
            ref={(ref) => {
              editor = ref;
              const key = props.documentKey;
              editorKey = key;
              const saved = props.state.viewState(key);
              requestAnimationFrame(() => {
                if (editor !== ref || key !== props.documentKey) return;
                if (saved?.selections?.length) ref.setSelections(saved.selections);
                if (saved?.offset) ref.setScrollOffset(saved.offset);
                if (props.active) ref.focus();
              });
            }}
            testID="file-editor"
            accessibilityLabel={doc().path}
            class="flex-1 bg-background text-foreground"
            onFocus={props.onFocus}
            onBlur={rememberOffset}
            onSelectionChange={({ selections }) => {
              props.state.rememberView(props.documentKey, { selections });
              rememberOffset();
            }}
            value={doc().text}
            language={doc().path}
            readOnly={doc().truncated || doc().saving || props.state.locked(props.documentKey)}
            onChange={(event) => props.state.edit(props.documentKey, event.value)}
            fontFamily={preferences().fontFamily}
            fontSize={preferences().fontSize}
            lineHeight={Math.round(preferences().fontSize * preferences().lineHeight)}
            tabSize={preferences().tabSize || undefined}
            softWrap={preferences().softWrap}
            lineNumbers={preferences().lineNumbers}
            indentGuides={preferences().indentGuides}
            activeLine={preferences().activeLine}
            showWhitespaces={preferences().showWhitespaces}
            scrollBeyondLastLine={false}
            classes={{
              gutter: "bg-sidebar",
              lineNumber: "text-quiet",
              activeLine: "bg-muted",
              selection: "bg-accent",
              caret: "bg-primary",
              indentGuide: "bg-border",
            }}
          />
        </If>
      </If>
    </View>
  );
}

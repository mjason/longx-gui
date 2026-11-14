import { effect, type InputRef, signal, Text, untracked, View } from "nsh";
import { Input } from "nsh/base";
import { resolvedModel } from "../../api/composer";
import { AppButton as Button } from "../../components/AppButton";
import { AttachmentButton, ComposerAttachments, confirmDroppedFiles } from "./ComposerAttachments";
import { ComposerGoal } from "./ComposerGoal";
import { ComposerModels, createComposerCatalog } from "./ComposerModels";
import { ComposerQueue } from "./ComposerQueue";
import { ComposerSuggestions } from "./ComposerSuggestions";
import { type Completion, composerCompletion, initPrompt } from "./composerCompletion";
import { createComposerState } from "./composerState";
import { createComposerWork } from "./composerWork";
import { type RecordValue, record } from "./threadModel";

export function ThreadComposer(props: {
  url: string;
  projectId: string;
  threadId: string;
  ready: boolean;
  running: boolean;
  turnId: string;
  turnStatus?: string;
  turn?: RecordValue;
  pendingResponse?: boolean;
  threadStatus?: string;
  canRetract?: boolean;
  canDiscard?: boolean;
  tokenUsage?: RecordValue;
  goal?: RecordValue | null;
  onCreated?: (thread: { id: string; title: string | null; status: string }) => void;
  onCommand?: (command: "new" | "git" | "files" | "settings") => void;
  onSend?: () => void;
}) {
  const catalog = createComposerCatalog(() => ({
    url: props.url,
    projectId: props.projectId,
    threadId: props.threadId,
  }));
  const ready = () =>
    props.ready &&
    !["archived", "unrecoverable"].includes(
      props.threadStatus || catalog.data()?.getThread?.status || "",
    ) &&
    (!!props.threadId || !!props.onCreated);
  let work: ReturnType<typeof createComposerWork> | undefined;
  const running = () => (props.turn ? props.turn.status === "inProgress" : props.running);
  const turnId = () =>
    props.turn && typeof props.turn.id === "string" ? props.turn.id : props.turnId;
  const state = createComposerState({
    url: () => props.url,
    projectId: () => props.projectId,
    threadId: () => props.threadId,
    ready,
    running,
    waiting: () => !!props.pendingResponse || !!work?.blocked(),
    turnId,
    canRetract: () => !!props.canRetract,
    canDiscard: () => !!props.canDiscard,
    onCreated: (thread) => props.onCreated?.(thread),
  });
  work = createComposerWork(() => ({
    url: props.url,
    projectId: props.projectId,
    threadId: props.threadId,
    active: state.draft()().queue.length > 0,
  }));
  const composing = signal(false),
    focused = signal(false),
    caret = signal(0),
    inputHeight = signal(72),
    uiError = signal(""),
    uiNotice = signal(""),
    goalOpen = signal(false);
  let input: InputRef | undefined;
  const completion = () => (composing() ? null : composerCompletion(state.draft()().text, caret()));
  effect(() => {
    state.scope();
    untracked(() => {
      composing.set(false);
      uiError.set("");
      uiNotice.set("");
      goalOpen.set(false);
      caret.set(state.draft()().text.length);
    });
  });
  effect(() => {
    const turn = props.turn;
    state.observeTurn(
      turn ? (typeof turn.id === "string" ? turn.id : "") : props.turnId,
      turn ? (typeof turn.status === "string" ? turn.status : "") : props.turnStatus,
    );
  });
  effect(() => {
    if (
      ready() &&
      !state.mustQueue() &&
      !state.blocked() &&
      !state.draft()().paused &&
      state.draft()().queue.length
    )
      untracked(() => void state.drain());
  });
  function submit(insert = false) {
    if (composing() || state.blocked() || !state.hasContent()) return;
    if (state.draft()().model && !catalog.data()) {
      uiError.set("模型设置尚未就绪，请先刷新模型列表。");
      return;
    }
    if (
      state.draft()().model &&
      catalog.data() &&
      !catalog.data()!.listModels.some((model) => model.slug === state.draft()().model) &&
      !catalog.data()!.modelAliases.some((alias) => alias.name === state.draft()().model)
    ) {
      uiError.set("所选模型已不可用，请重新选择。");
      return;
    }
    if (state.draft()().effort && catalog.data()) {
      const model = resolvedModel(catalog.data()!, state.draft()().model).model;
      if (!model?.reasoningLevels.includes(state.draft()().effort!)) {
        uiError.set("当前模型不支持这个档位，请重新选择。");
        return;
      }
    }
    uiError.set("");
    props.onSend?.();
    void state.send(insert);
  }
  function replace(value: string, match: Completion) {
    const body = state.draft()().text;
    const text = body.slice(0, match.start) + value + (value ? " " : "") + body.slice(match.end);
    state.edit(text);
    caret.set(match.start + value.length + (value ? 1 : 0));
    input?.focus();
    input?.setSelection(caret());
  }
  function command(id: string, match: Completion) {
    replace("", match);
    if (id === "goal") {
      goalOpen.set(true);
      return;
    }
    if (id === "compact") {
      void state.compact();
      return;
    }
    if (id === "init") {
      state.edit([initPrompt, state.draft()().text].filter(Boolean).join("\n\n"));
      submit();
      return;
    }
    if (["new", "git", "files", "settings"].includes(id)) {
      props.onCommand?.(id as "new" | "git" | "files" | "settings");
    }
  }
  async function drop(uris: string[], mimeTypes?: string[]) {
    const attach = state.captureAttachments(),
      scope = state.scope();
    try {
      await attach(
        await confirmDroppedFiles(uris, mimeTypes ?? [], (message) => {
          if (scope === state.scope()) uiNotice.set(message);
        }),
      );
    } catch (error) {
      if (scope === state.scope())
        uiError.set(error instanceof Error ? error.message : "无法读取拖入文件。");
    }
  }
  const usage = () => {
    if (record(props.tokenUsage?.context).status === "pending") return "上下文已压缩，等待用量更新";
    const total = record(props.tokenUsage?.last).totalTokens,
      window = props.tokenUsage?.modelContextWindow;
    return typeof total === "number" && typeof window === "number" && window > 0
      ? `上下文 ${Math.round((total / window) * 100)}%`
      : "";
  };
  const activity = () => {
    const draft = state.draft()();
    if (!ready() && (running() || draft.sending || draft.awaitingTurn))
      return "连接未就绪，运行状态待确认";
    if (props.pendingResponse) return "等待你的回应";
    if (draft.stopping) return "正在停止…";
    if (running()) return "正在运行";
    if (draft.sending) return "正在发送…";
    if (draft.awaitingTurn) return "已提交，等待启动…";
    return "";
  };
  return (
    <View
      testID="thread-composer"
      class="shrink-0"
      onFileDrop={({ uris, mimeTypes }) => void drop(uris, mimeTypes)}
    >
      <If when={!!activity()}>
        <View
          testID="composer-activity"
          accessibilityLabel={activity()}
          class="h-9 px-6 flex-row items-center gap-2 border-t border-border bg-accent"
        >
          <If when={ready() && !props.pendingResponse}>
            <View
              testID="composer-activity-spinner"
              class="w-3 h-3 rounded-full border-2 border-primary/30 border-t-primary animate-spin"
              style={{ animationFrameRate: 30 }}
            />
          </If>
          <Text
            testID="composer-activity-label"
            class="text-xs text-primary"
            style={{ lineHeight: 18 }}
          >
            {activity()}
          </Text>
          <If when={ready() && running() && !props.pendingResponse && !state.draft()().stopping}>
            <Text class="text-xs text-muted-foreground">正在思考或执行任务…</Text>
          </If>
        </View>
      </If>
      <ComposerQueue state={state} />
      <View class="px-6 py-3 border-t border-border bg-surface gap-2">
        <ComposerAttachments state={state} />
        <Input
          ref={(value) => {
            input = value;
          }}
          testID="thread-input"
          accessibilityLabel="消息"
          value={state.draft()().text}
          onChange={({ value }) => {
            const previous = state.draft()().text;
            state.edit(value);
            caret.set(
              Math.max(0, Math.min(value.length, caret() + value.length - previous.length)),
            );
          }}
          onSelectionChange={({ start }) => caret.set(start)}
          onFocus={() => focused.set(true)}
          onBlur={() => focused.set(false)}
          multiline
          submitBehavior="submit"
          onSubmit={() => {
            const match = completion();
            if (
              match?.kind === "/" &&
              ["new", "compact", "init", "goal", "git", "files", "settings"].includes(match.query)
            )
              command(match.query, match);
            else submit();
          }}
          onPaste={({ files, uris }) => {
            if (files.length) void state.addFiles(files);
            else if (uris.length) void drop(uris);
          }}
          onCompositionChange={({ composing: active }) => composing.set(active)}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="写一条消息…  @ 引用 · / 命令"
          class="w-full text-[14px] text-foreground placeholder:text-quiet"
          style={{ height: inputHeight(), lineHeight: 22 }}
          onContentSizeChange={({ size }) =>
            inputHeight.set(Math.min(160, Math.max(72, size.height)))
          }
        />
        <If when={!!uiError()}>
          <Text class="text-xs text-destructive">{uiError()}</Text>
        </If>
        <If when={!!uiNotice()}>
          <Text class="text-xs text-quiet">{uiNotice()}</Text>
        </If>
        <If when={!!state.draft()().error}>
          <View class="flex-row items-center gap-2">
            <Text
              testID="thread-send-error"
              class="flex-1 text-xs text-destructive"
              style={{ numberOfLines: 2 }}
            >
              {state.draft()().error}
            </Text>
            <If when={state.draft()().uncertain}>
              <Button
                testID="thread-send-acknowledge"
                class="h-7 px-2 rounded hover:bg-accent"
                onPress={state.acknowledge}
              >
                <Text class="text-xs text-muted-foreground">已核对，允许重试</Text>
              </Button>
            </If>
          </View>
        </If>
        <View class="min-h-7 flex-row flex-wrap items-center gap-1">
          <AttachmentButton state={state} onError={uiError.set} />
          <ComposerSuggestions
            url={props.url}
            projectId={props.projectId}
            threadId={props.threadId}
            completion={completion()}
            focusInput={() => input?.focus()}
            focused={focused()}
            onPlainSubmit={() => submit()}
            onActivate={(kind) => {
              const match = completion();
              if (match?.kind !== kind) {
                const value = state.draft()().text;
                const position = Math.min(caret(), value.length);
                const prefix = position && !/\s/.test(value[position - 1]) ? " " : "";
                state.edit(value.slice(0, position) + prefix + kind + value.slice(position));
                caret.set(position + prefix.length + 1);
                input?.setSelection(caret());
              }
            }}
            onInsert={replace}
            onCommand={command}
          />
          <ComposerModels state={state} catalog={catalog} />
          <View class="flex-1" />
          <If when={running()}>
            <Button
              testID="composer-stop"
              accessibilityLabel="停止当前轮"
              class="h-7 px-2 rounded hover:bg-accent"
              disabled={!ready() || state.draft()().stopping || state.draft()().sending}
              onPress={() => void state.stop()}
            >
              <Text class="text-xs text-destructive">
                {state.draft()().stopping ? "停止中…" : "停止"}
              </Text>
            </Button>
            <If when={state.hasContent()}>
              <Button
                testID="composer-insert"
                class="h-7 px-2 rounded hover:bg-accent"
                disabled={state.blocked() || composing()}
                onPress={() => submit(true)}
              >
                <Text class="text-xs text-primary">立即插入</Text>
              </Button>
            </If>
          </If>
          <If when={!running() && state.draft()().paused && !state.draft()().queue.length}>
            <Button
              testID="composer-continue"
              class="h-7 px-2 rounded hover:bg-accent"
              disabled={state.blocked()}
              onPress={() => void state.resume()}
            >
              <Text class="text-xs text-primary">继续</Text>
            </Button>
          </If>
          <If when={!running() && state.draft()().paused && props.canDiscard}>
            <Button
              testID="composer-discard-stopped"
              class="h-7 px-2 rounded hover:bg-accent"
              disabled={state.blocked()}
              onPress={() => void state.discardStopped()}
            >
              <Text class="text-xs text-muted-foreground">撤回此轮</Text>
            </Button>
          </If>
          <Button
            testID="thread-send"
            accessibilityLabel="发送消息"
            disabled={state.blocked() || composing() || !state.hasContent()}
            onPress={() => submit()}
            class="h-7 px-3 rounded bg-accent disabled:opacity-50"
          >
            <Text class="text-xs text-primary">
              {state.draft()().sending ? "发送中…" : state.mustQueue() ? "排队 ↑" : "发送 ↑"}
            </Text>
          </Button>
        </View>
        <View class="h-5 flex-row items-center gap-2">
          <Text class="flex-1 text-xs text-quiet" style={{ numberOfLines: 1 }}>
            {state.draft()().sending
              ? "正在发送…"
              : state.draft()().awaitingTurn
                ? "已发送，正在同步会话…"
                : !ready()
                  ? "连接就绪后可发送 · 草稿保留"
                  : running()
                    ? "Enter 排队 · 可立即插入 · Shift+Enter 换行"
                    : work && !work.known()
                      ? "正在确认后台工作，队列暂不自动发送"
                      : work?.pending()
                        ? "等待后台工作结束后发送队列"
                        : "Enter 发送 · Shift+Enter 换行"}
          </Text>
          <If when={!!usage()}>
            <Text class="text-xs text-quiet">{usage()}</Text>
          </If>
        </View>
      </View>
      <If when={goalOpen()}>
        <ComposerGoal state={state} goal={props.goal} onClose={() => goalOpen.set(false)} />
      </If>
    </View>
  );
}

import {
  Clipboard,
  computed,
  effect,
  List,
  type ListRef,
  openUrl,
  signal,
  Text,
  token,
  untracked,
  View,
} from "nsh";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
  Avatar,
  Collapsible,
  TextView,
} from "nsh/base";
import { checkPath } from "../../api/files";
import { AppButton as Button } from "../../components/AppButton";
import { Icon } from "../../components/Icon";
import { AssistantIdentity } from "./AssistantIdentity";
import { ComposerWaiting } from "./ComposerWaiting";
import { PresentView } from "./PresentView";
import { ReasoningView } from "./ReasoningView";
import { ThreadComposer } from "./ThreadComposer";
import { ThreadImage } from "./ThreadImage";
import {
  type ActivityRow,
  activityFailures,
  activitySummary,
  groupThreadItems,
  isConversationMessage,
  type ThreadRowData,
} from "./threadGroups";
import { contentText, record, type ThreadItem, text } from "./threadModel";
import {
  assistantFiles,
  assistantText,
  canDiscardTurn,
  canRetractTurn,
  presentThreadRows,
} from "./threadPresentation";
import { createThreadState, type ThreadState } from "./threadState";
import {
  isImageViewItem,
  isPresentItem,
  isThreadView,
  presentTree,
  toolImageSource,
} from "./threadViews";

const labels: Record<string, string> = {
  userMessage: "你",
  agentMessage: "助手",
  reasoning: "思考过程",
  commandExecution: "执行命令",
  dynamicToolCall: "工具调用",
  fileChange: "文件变更",
  webSearch: "网页检索",
  subAgentActivity: "子 Agent 活动",
  unknown: "活动",
};
const readingPositions = new Map<
  string,
  {
    follow: boolean;
    y: number;
    anchor?: { id: string; offset: number };
  }
>();
function title(item: ThreadItem) {
  if (item.type === "userMessage")
    return record(item.origin).kind === "goal" ? "目标续跑通知" : "后台任务通知";
  if (item.type === "dynamicToolCall")
    return `${text(item.namespace)}${item.namespace ? " · " : ""}${text(item.tool) || "工具调用"}`;
  if (item.type === "commandExecution") return text(item.command) || "执行命令";
  if (item.type === "webSearch") return text(item.query) || "网页检索";
  return labels[item.type] ?? item.type;
}
function details(item: ThreadItem) {
  if (item.type === "userMessage") return contentText(item.content);
  if (item.type === "reasoning")
    return contentText(item.summary) || contentText(item.content) || "暂无可显示的思考摘要。";
  if (item.type === "commandExecution")
    return `${text(item.command)}\n\n${text(item.aggregatedOutput)}${typeof item.exitCode === "number" ? `\n退出码：${item.exitCode}` : ""}`;
  if (item.type === "dynamicToolCall")
    return `参数\n${typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? {}, null, 2)}\n\n${contentText(item.contentItems) || (item.success === false ? "工具执行失败。" : "")}`;
  return JSON.stringify(item, null, 2);
}
function ThreadRow(props: {
  item: ThreadItem;
  state: ThreadState;
  onFile: (path: string) => void;
  onLink: (url: string) => void;
  compact?: boolean;
  baseUrl?: string;
  projectId?: string;
}) {
  const imageWidth = signal(280);
  const message = () => isConversationMessage(props.item);
  const failed = () =>
    props.item.success === false ||
    ["failed", "declined"].includes(text(props.item.status)) ||
    (typeof props.item.exitCode === "number" && props.item.exitCode !== 0);
  const body = () =>
    props.item.type === "agentMessage" ? text(props.item.text) : contentText(props.item.content);
  const streaming = () =>
    props.item.type === "agentMessage" &&
    props.state.view()?.items.at(-1)?.id === props.item.id &&
    props.state.view()?.turn?.id === props.item.turnId &&
    props.state.view()?.turn?.status === "inProgress";
  const changes = () => (Array.isArray(props.item.changes) ? props.item.changes.map(record) : []);
  const markdownDetails = () => ["userMessage", "dynamicToolCall"].includes(props.item.type);
  const documentBody = () =>
    props.item.type === "dynamicToolCall"
      ? contentText(props.item.contentItems) ||
        (props.item.success === false ? "工具执行失败。" : "")
      : details(props.item);
  return (
    <View
      testID={`thread-item-${props.item.id}`}
      class={
        props.compact
          ? "px-2 py-1 gap-1"
          : props.item.type === "userMessage"
            ? "mt-3 mb-5 flex-row items-start gap-2"
            : "pl-9 py-2"
      }
    >
      <If when={message() && props.item.type === "userMessage"}>
        <View testID={`thread-user-avatar-${props.item.id}`} class="mt-2 shrink-0">
          <Avatar
            name="你"
            accessibilityLabel=""
            class="w-7 h-7"
            fallbackClass="items-center justify-center rounded-md bg-muted"
            fallback={<Icon name="user" color={token("muted-foreground")} size={18} />}
          />
        </View>
      </If>
      <View
        onLayout={(event) => imageWidth.set(Math.min(560, Math.max(1, event.bounds.size.width)))}
        class={
          message() && props.item.type === "userMessage"
            ? "flex-1 min-w-0 px-4 py-3 gap-1 rounded-md bg-surface"
            : "w-full gap-1"
        }
      >
        <If when={message()}>
          <If when={props.item.type === "agentMessage"}>
            <TextView
              markdown={body()}
              options={{ streaming: streaming() }}
              selectable
              class="w-full text-[14px] text-foreground"
              styles={{ root: { fontSize: 14, lineHeight: 24 } }}
              classes={{
                paragraph: "text-sm leading-6",
                heading1: "text-lg font-semibold mt-4 mb-2",
                heading2: "text-base font-semibold mt-3 mb-2",
                heading3: "text-sm font-semibold mt-3 mb-1",
                codeBlock: "rounded-md border border-border bg-surface",
                codeBlockCode: "p-3 text-[13px] leading-5",
              }}
              codeBlockActions={[{ id: "copy", label: "复制" }]}
              onLinkPress={({ url }) => props.onLink(url)}
              renderImage={(image) => (
                <ThreadImage
                  src={image.src}
                  alt={image.alt}
                  baseUrl={props.baseUrl || ""}
                  width={imageWidth()}
                />
              )}
            />
          </If>
          <If when={props.item.type === "userMessage"}>
            <Each
              of={
                Array.isArray(props.item.content)
                  ? props.item.content.map((part) =>
                      typeof part === "string" ? { type: "text", text: part } : record(part),
                    )
                  : [{ type: "text", text: body() }]
              }
            >
              {(part, index) => (
                <View>
                  <If when={part().type === "text" && !!text(part().text)}>
                    <Text
                      class="text-[14px] text-foreground"
                      style={{ lineHeight: 24, userSelect: "text" }}
                    >
                      {text(part().text)}
                    </Text>
                  </If>
                  <If when={part().type === "image"}>
                    <ThreadImage
                      id={`thread-image-${props.item.id}-${index()}`}
                      src={text(part().url)}
                      alt={text(part().alt)}
                      baseUrl={props.baseUrl || ""}
                    />
                  </If>
                </View>
              )}
            </Each>
            <If
              when={
                Array.isArray(props.item.content) &&
                props.item.content.some(
                  (value) => !["text", "image"].includes(text(record(value).type)),
                )
              }
            >
              <Text class="text-xs text-quiet">包含其他附件</Text>
            </If>
          </If>
        </If>
        <If when={props.item.type === "reasoning"}>
          <ReasoningView
            item={props.item}
            open={props.state.expanded().includes(props.item.id)}
            active={
              props.state.view()?.turn?.status === "inProgress" &&
              props.state.view()?.turn?.id === props.item.turnId &&
              props.state.view()?.items.at(-1)?.id === props.item.id &&
              !["completed", "failed", "interrupted"].includes(String(props.item.status))
            }
            onToggle={() => props.state.toggle(props.item.id)}
            onCollapse={() => props.state.setExpanded(props.item.id, false)}
          />
        </If>
        <If when={!message() && props.item.type !== "reasoning"}>
          <Collapsible
            open={props.state.expanded().includes(props.item.id)}
            content={
              <View class="mt-2 p-3 rounded bg-muted gap-2">
                <If when={isPresentItem(props.item)}>
                  <PresentView
                    tree={presentTree(props.item)}
                    baseUrl={props.baseUrl ?? ""}
                    width={Math.max(1, imageWidth() - 24)}
                    id={`thread-view-${props.item.id}`}
                  />
                  <If when={failed()}>
                    <Text class="text-xs text-destructive">视图工具执行失败，请核对内容。</Text>
                  </If>
                </If>
                <If when={isImageViewItem(props.item)}>
                  <ThreadImage
                    src={toolImageSource(props.item, props.projectId ?? "")}
                    baseUrl={props.baseUrl ?? ""}
                    width={Math.max(1, imageWidth() - 24)}
                    alt={text(record(props.item.details).name) || "工具图片"}
                    id={`thread-tool-image-${props.item.id}`}
                  />
                </If>
                <If when={props.item.type === "dynamicToolCall" && !isThreadView(props.item)}>
                  <Text class="text-xs text-quiet">参数</Text>
                  <Text
                    class="font-mono text-xs text-muted-foreground"
                    style={{ userSelect: "text" }}
                  >
                    {(typeof props.item.arguments === "string"
                      ? props.item.arguments
                      : JSON.stringify(props.item.arguments ?? {}, null, 2)
                    ).slice(0, 24000)}
                  </Text>
                </If>
                <If when={markdownDetails() && !isThreadView(props.item)}>
                  <TextView
                    testID={`thread-document-${props.item.id}`}
                    markdown={documentBody().slice(0, 24000)}
                    selectable
                    class="w-full text-sm text-foreground"
                    classes={{
                      paragraph: "text-sm leading-6",
                      heading1: "text-lg font-semibold mt-3 mb-2",
                      heading2: "text-base font-semibold mt-3 mb-2",
                      heading3: "text-sm font-semibold mt-2 mb-1",
                      codeBlock: "rounded border border-border bg-surface",
                      codeBlockCode: "p-3 text-xs font-mono",
                    }}
                    codeBlockActions={[{ id: "copy", label: "复制" }]}
                    onLinkPress={({ url }) => props.onLink(url)}
                    renderImage={(image) => (
                      <ThreadImage
                        src={image.src}
                        alt={image.alt}
                        baseUrl={props.baseUrl || ""}
                        width={Math.max(1, imageWidth() - 24)}
                      />
                    )}
                  />
                </If>
                <If when={!markdownDetails() && !isThreadView(props.item)}>
                  <Text
                    class="font-mono text-xs text-muted-foreground"
                    style={{ userSelect: "text" }}
                  >
                    {details(props.item).slice(0, 24000)}
                  </Text>
                </If>
                <If when={!isThreadView(props.item) && details(props.item).length > 24000}>
                  <Text class="text-xs text-quiet">内容较长，仅显示前 24000 字符。</Text>
                </If>
                <Each of={changes()}>
                  {(change) => (
                    <Button
                      class="h-7 px-2 self-start rounded hover:bg-accent"
                      onPress={() => props.onFile(text(change().path))}
                    >
                      <Text class="text-xs text-primary">{text(change().path) || "未知文件"}</Text>
                    </Button>
                  )}
                </Each>
                <Button
                  testID={`thread-collapse-${props.item.id}`}
                  class="h-7 px-2 self-start rounded hover:bg-accent"
                  onPress={() => props.state.setExpanded(props.item.id, false)}
                >
                  <Text class="text-xs text-muted-foreground">收起此项 ↑</Text>
                </Button>
              </View>
            }
          >
            <View
              role="button"
              testID={`thread-toggle-${props.item.id}`}
              accessibilityState={{ expanded: props.state.expanded().includes(props.item.id) }}
              onPress={() => props.state.toggle(props.item.id)}
              class="h-7 flex-row items-center gap-2 rounded hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Icon
                name={props.state.expanded().includes(props.item.id) ? "chevronDown" : "chevron"}
                size={12}
              />
              <Text
                class="flex-1 h-5 text-xs text-muted-foreground"
                style={{ numberOfLines: 1, lineHeight: 16, textAlignVertical: "center" }}
              >
                {title(props.item)}
              </Text>
              <Text
                class={failed() ? "h-5 text-xs text-destructive" : "h-5 text-xs text-quiet"}
                style={{ lineHeight: 16, textAlignVertical: "center" }}
              >
                {failed()
                  ? "失败"
                  : props.item.status === "inProgress"
                    ? "进行中"
                    : props.item.status === "completed"
                      ? "完成"
                      : ""}
              </Text>
            </View>
          </Collapsible>
        </If>
      </View>
    </View>
  );
}
function ThreadActivityGroup(props: {
  row: ActivityRow;
  state: ThreadState;
  running: boolean;
  onFile: (path: string) => void;
  onLink: (url: string) => void;
  baseUrl: string;
  projectId: string;
}) {
  const failures = () => activityFailures(props.row);
  const open = () => props.state.expanded().includes(props.row.id);
  return (
    <View class="pl-9 py-2" testID={`thread-group-${props.row.id}`}>
      <Accordion
        multiple
        value={open() ? [props.row.id] : []}
        onChange={({ value }) =>
          props.state.setExpanded(props.row.id, value.includes(props.row.id))
        }
      >
        <AccordionItem value={props.row.id} class="border-y border-border/60">
          <AccordionHeader level={3}>
            <AccordionTrigger
              testID={`thread-group-toggle-${props.row.id}`}
              class="group h-8 flex-row items-center gap-2 rounded hover:bg-accent"
              accessibilityLabel={`执行过程：${activitySummary(props.row)}`}
            >
              <Icon name={open() ? "chevronDown" : "chevron"} size={12} />
              <Text
                class="h-5 text-xs text-muted-foreground"
                style={{ lineHeight: 16, textAlignVertical: "center" }}
              >
                {props.running ? "正在处理" : "执行过程"}
              </Text>
              <Text
                class="flex-1 h-5 text-xs text-quiet"
                style={{ numberOfLines: 1, lineHeight: 16, textAlignVertical: "center" }}
              >
                {activitySummary(props.row)}
              </Text>
              <If when={!!failures()}>
                <Text
                  testID={`thread-group-failures-${props.row.id}`}
                  class="h-5 text-xs text-destructive"
                  style={{ lineHeight: 16, textAlignVertical: "center" }}
                >
                  {failures()} 项失败
                </Text>
              </If>
              <If when={props.running}>
                <Text
                  class="h-5 text-xs text-primary"
                  style={{ lineHeight: 16, textAlignVertical: "center" }}
                >
                  进行中
                </Text>
              </If>
            </AccordionTrigger>
          </AccordionHeader>
          <AccordionPanel accessibilityLabel="工具与思考记录">
            <View class="ml-1 pl-3 border-l border-border pb-2">
              <Each of={props.row.items} key={(item) => item.id}>
                {(item) => (
                  <ThreadRow
                    item={item()}
                    state={props.state}
                    onFile={props.onFile}
                    onLink={props.onLink}
                    baseUrl={props.baseUrl}
                    projectId={props.projectId}
                    compact
                  />
                )}
              </Each>
              <Button
                testID={`thread-group-collapse-${props.row.id}`}
                class="h-8 px-2 self-start rounded hover:bg-accent"
                onPress={() => props.state.setExpanded(props.row.id, false)}
              >
                <Text class="text-xs text-muted-foreground">收起执行过程 ↑</Text>
              </Button>
            </View>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </View>
  );
}
export function ThreadPane(props: {
  url: string;
  projectId: string;
  threadId: string;
  onFile: (path: string) => void;
  subscribe?: Parameters<typeof createThreadState>[0]["subscribe"];
  onCommand?: (command: "new" | "git" | "files" | "settings") => void;
}) {
  const scope = () => JSON.stringify([props.url, props.projectId, props.threadId]);
  let readingScope = scope();
  const followLatest = signal(readingPositions.get(readingScope)?.follow ?? true);
  effect(() => {
    const next = scope();
    if (next !== readingScope) {
      readingScope = next;
      followLatest.set(readingPositions.get(next)?.follow ?? true);
    }
  });
  effect(() => {
    const key = scope(),
      follow = followLatest();
    const saved = readingPositions.get(key);
    readingPositions.set(key, { ...saved, follow, y: saved?.y ?? 0 });
  });
  const threadState = createThreadState({
    url: () => props.url,
    projectId: () => props.projectId,
    threadId: () => props.threadId,
    subscribe: props.subscribe,
  });
  // Expansion is a reading action, not a new streamed reply. Disable end-follow
  // before changing row height so native anchoring keeps the clicked heading.
  const state: ThreadState = {
    ...threadState,
    toggle(id) {
      followLatest.set(false);
      threadState.toggle(id);
    },
    setExpanded(id, open) {
      followLatest.set(false);
      threadState.setExpanded(id, open);
    },
  };
  const away = signal(false),
    linkError = signal("");
  const narrow = signal(false);
  const copied = signal({ key: "", value: "" });
  let previousRows: ThreadRowData[] = [],
    previousThread = "";
  const rows = computed(() => {
    const view = state.view();
    if (!view) {
      previousRows = [];
      return previousRows;
    }
    if (view.threadId !== previousThread) {
      previousRows = [];
    }
    previousThread = view.threadId;
    previousRows = groupThreadItems(view.items, previousRows);
    return previousRows;
  });
  const presented = computed(() => presentThreadRows(rows()));
  const currentActivity = computed(() => {
    const turn = state.view()?.turn;
    if (turn?.status !== "inProgress") return null;
    return rows()
      .filter((row): row is ActivityRow => row.kind === "activity" && row.turnId === turn.id)
      .at(-1);
  });
  let activeProcess: { scope: string; turnId: string; ids: string[] } | null = null;
  effect(() => {
    const view = state.view();
    const scope = JSON.stringify([props.url, props.projectId, props.threadId]);
    if (!view || activeProcess?.scope !== scope) activeProcess = null;
    if (!view) return;
    if (
      activeProcess &&
      (view.turn?.id !== activeProcess.turnId || view.turn?.status !== "inProgress")
    ) {
      const ids = activeProcess.ids;
      activeProcess = null;
      untracked(() => threadState.autoCollapse(ids));
    }
    if (view.turn?.status !== "inProgress") return;
    const groups = rows().filter(
      (row): row is ActivityRow => row.kind === "activity" && row.turnId === view.turn?.id,
    );
    activeProcess = {
      scope,
      turnId: String(view.turn.id),
      ids: groups.flatMap((row) => [row.id, ...row.items.map((item) => item.id)]),
    };
    const completed = groups.flatMap((row) =>
      row.items
        .filter((item) =>
          ["completed", "failed", "interrupted", "declined"].includes(String(item.status)),
        )
        .map((item) => item.id),
    );
    untracked(() => threadState.autoCollapse(completed));
  });
  effect(() => {
    const row = currentActivity();
    if (!row) return;
    const latest = row.items.at(-1);
    const ids = [row.id];
    if (
      latest &&
      (latest.status === "inProgress" || (latest.type === "reasoning" && !latest.status))
    )
      ids.push(latest.id);
    // Automatic expansion follows new work; manual collapse survives subsequent deltas.
    // Bypass the reading-action wrapper so it does not disable bottom-follow.
    untracked(() => threadState.autoExpand(ids));
  });
  const copyKey = (key: string) => `${scope()}:${key}`;
  async function copyAssistant(key: string) {
    const value = assistantText(presented(), key),
      current = copyKey(key);
    if (!value) return;
    try {
      await Clipboard.writeText(value);
      if (current === copyKey(key)) copied.set({ key: current, value });
    } catch {
      linkError.set("无法复制回复，请重试。");
    }
  }
  let list: ListRef | undefined;
  let restoringReading = false,
    readingGeneration = 0;
  function restoreReading(ref: ListRef) {
    const key = scope(),
      saved = readingPositions.get(key);
    if (!saved || saved.follow) return;
    restoringReading = true;
    ++readingGeneration;
    requestAnimationFrame(() => {
      if (list !== ref || key !== scope()) return;
      const index = saved.anchor ? presented().findIndex((row) => row.id === saved.anchor!.id) : -1;
      if (index >= 0)
        ref.scrollToIndex({ index, viewOffset: -saved.anchor!.offset, animated: false });
      else ref.scrollToOffset({ offset: saved.y, animated: false });
      requestAnimationFrame(() => {
        if (list === ref && key === scope()) restoringReading = false;
      });
    });
  }
  function rememberReading(y: number) {
    if (restoringReading) return;
    const key = scope(),
      ref = list,
      generation = ++readingGeneration;
    const ids = presented().map((row) => row.id);
    readingPositions.set(key, { ...readingPositions.get(key), follow: followLatest(), y });
    if (ref && typeof ref.measureScrollPosition === "function")
      void ref
        .measureScrollPosition()
        .then((position) => {
          if (!position || list !== ref || key !== scope() || generation !== readingGeneration)
            return;
          const id = ids[position.index];
          if (id)
            readingPositions.set(key, {
              follow: followLatest(),
              y,
              anchor: { id, offset: position.offset },
            });
        })
        .catch(() => {});
  }
  let historyArmed = false;
  function onFile(path: string) {
    try {
      checkPath(path);
      props.onFile(path);
    } catch {
      linkError.set("文件路径不属于当前项目，未打开。");
    }
  }
  function onLink(url: string) {
    if (/^https?:\/\//i.test(url)) {
      void openUrl(url).catch(() => linkError.set("链接未能打开。"));
    } else if (!url.startsWith("#")) onFile(url);
  }
  return (
    <View
      testID="thread-pane"
      class="flex-1 bg-background"
      onLayout={(event) => narrow.set(event.bounds.size.width < 600)}
    >
      <View class="h-8 px-4 flex-row items-center gap-3 border-b border-border">
        <Text class="flex-1 text-xs text-muted-foreground">
          {state.loading()
            ? "正在读取会话…"
            : !state.connected()
              ? "连接已断开"
              : state.view()?.requests.length
                ? "等待你的回应"
                : state.view()?.turn?.status === "inProgress"
                  ? "运行中"
                  : "会话记录"}
        </Text>
        <If when={state.expanded().length > 0}>
          <Button
            testID="thread-collapse-all"
            class="h-6 px-2 rounded hover:bg-accent"
            onPress={() => {
              for (const id of state.expanded()) state.setExpanded(id, false);
            }}
          >
            <Text class="text-xs text-muted-foreground">全部收起</Text>
          </Button>
        </If>
        <Button
          testID="thread-refresh"
          onPress={state.retry}
          class="h-6 px-2 rounded hover:bg-accent"
        >
          <Text class="text-xs text-muted-foreground">重新同步</Text>
        </Button>
      </View>
      <If when={!!state.error()}>
        <Text testID="thread-error" class="px-4 py-2 text-xs text-destructive">
          {state.error()}
        </Text>
      </If>
      <If when={!!linkError()}>
        <Text class="px-4 py-1 text-xs text-destructive">{linkError()}</Text>
      </If>
      <If when={!!state.view()}>
        <List
          testID="thread-timeline"
          ref={(value) => {
            list = value;
            restoreReading(value);
          }}
          class="flex-1"
          each={presented()}
          keyExtractor={(item) => item.id}
          estimatedItemSize={90}
          initialScrollAtEnd={followLatest()}
          maintainVisibleContentPosition={followLatest() ? { autoscrollToBottomThreshold: 72 } : {}}
          onScroll={(event) => {
            away.set(event.contentSize.height - event.offset.y - event.size.height > 100);
            rememberReading(event.offset.y);
          }}
          onScrollDragStart={() => {
            historyArmed = true;
          }}
          onScrollDragEnd={() => followLatest.set(!away())}
          onLoadMoreAtStart={() => {
            if (historyArmed) {
              historyArmed = false;
              void state.earlier();
            }
          }}
          header={
            <View class="px-6 py-2">
              <If when={!!state.view()?.earlier.items}>
                <Button
                  testID="thread-earlier"
                  disabled={state.paging() || !state.connected()}
                  onPress={() => {
                    void state.earlier();
                  }}
                  class="h-7 px-2 self-center rounded hover:bg-accent"
                >
                  <Text class="text-xs text-muted-foreground">
                    {state.paging()
                      ? "正在加载…"
                      : `加载更早记录 · ${state.view()?.earlier.items} 条`}
                  </Text>
                </Button>
              </If>
              <If when={!!state.pageError()}>
                <Text class="text-xs text-destructive">{state.pageError()}</Text>
              </If>
            </View>
          }
          empty={<Text class="p-6 text-sm text-muted-foreground">这个会话还没有消息。</Text>}
        >
          {(row) => (
            <View class="w-full items-center">
              <View
                testID={`thread-reading-${row().id}`}
                class="w-full max-w-[860px]"
                style={{ paddingHorizontal: narrow() ? 12 : 24 }}
              >
                <If when={row().assistantStart}>
                  <AssistantIdentity
                    id={row().assistantKey!}
                    turn={
                      row().turnId === state.view()?.turn?.id ? (state.view()?.turn ?? null) : null
                    }
                  />
                </If>
                <If when={row().kind === "message"}>
                  <ThreadRow
                    item={(row() as Extract<ThreadRowData, { kind: "message" }>).item}
                    baseUrl={props.url}
                    projectId={props.projectId}
                    state={state}
                    onFile={onFile}
                    onLink={onLink}
                  />
                </If>
                <If when={row().kind === "activity"}>
                  <ThreadActivityGroup
                    baseUrl={props.url}
                    projectId={props.projectId}
                    row={row() as ActivityRow}
                    state={state}
                    running={row().id === currentActivity()?.id}
                    onFile={onFile}
                    onLink={onLink}
                  />
                </If>
                <If
                  when={
                    row().assistantEnd &&
                    row().assistantKey !== null &&
                    !(
                      row().turnId === state.view()?.turn?.id &&
                      state.view()?.turn?.status === "inProgress"
                    )
                  }
                >
                  <View class="pl-9 pb-5 pt-2 gap-2">
                    <If when={assistantFiles(presented(), row().assistantKey!).length > 0}>
                      <Text class="text-xs text-quiet">相关文件</Text>
                      <View class="flex-row flex-wrap gap-2">
                        <Each
                          of={assistantFiles(presented(), row().assistantKey!)}
                          key={(file) => file.path}
                        >
                          {(file) => (
                            <Button
                              testID={`thread-file-${file().path}`}
                              disabled={file().deleted}
                              accessibilityLabel={`打开 ${file().path}`}
                              onPress={() => onFile(file().path)}
                              class="h-8 px-3 gap-2 max-w-full rounded-md border border-border bg-surface hover:bg-accent disabled:opacity-50"
                            >
                              <Icon name="file" size={13} />
                              <Text
                                class="flex-1 text-xs text-muted-foreground"
                                style={{ numberOfLines: 1 }}
                              >
                                {file().path}
                              </Text>
                              <If when={file().deleted}>
                                <Text class="text-xs text-quiet">已删除</Text>
                              </If>
                            </Button>
                          )}
                        </Each>
                      </View>
                    </If>
                    <If when={!!assistantText(presented(), row().assistantKey!)}>
                      <Button
                        testID={`thread-copy-${row().assistantKey}`}
                        accessibilityLabel="复制已加载的助手正文"
                        onPress={() => {
                          void copyAssistant(row().assistantKey!);
                        }}
                        class="h-7 px-2 self-start rounded hover:bg-accent"
                      >
                        <Text class="text-xs text-quiet">
                          {copied().key === copyKey(row().assistantKey!) &&
                          copied().value === assistantText(presented(), row().assistantKey!)
                            ? "已复制"
                            : "复制已加载正文"}
                        </Text>
                      </Button>
                    </If>
                  </View>
                </If>
              </View>
            </View>
          )}
        </List>
      </If>
      <If when={away()}>
        <Button
          testID="thread-to-bottom"
          onPress={() => {
            followLatest.set(true);
            list?.scrollToEnd({ animated: false });
            away.set(false);
          }}
          class="h-7 px-3 self-center rounded bg-accent"
        >
          <Text class="text-xs text-primary">回到最新消息 ↓</Text>
        </Button>
      </If>
      <If when={!!state.view()?.requests.length}>
        <Text testID="thread-pending" class="px-4 py-2 text-xs text-ochre">
          有 {state.view()?.requests.length} 个待回应请求；请在网页端处理。
        </Text>
      </If>
      <ComposerWaiting
        url={props.url}
        threadId={props.threadId}
        waiting={state.view()?.waiting ?? {}}
        ready={state.connected() && !!state.view() && !state.loading() && !state.error()}
      />
      <ThreadComposer
        url={props.url}
        projectId={props.projectId}
        threadId={props.threadId}
        ready={state.connected() && !!state.view() && !state.loading() && !state.error()}
        running={state.view()?.turn?.status === "inProgress"}
        turnId={
          typeof state.view()?.turn?.id === "string" ? (state.view()!.turn!.id as string) : ""
        }
        turnStatus={text(state.view()?.turn?.status)}
        turn={state.view()?.turn ?? undefined}
        pendingResponse={!!state.view()?.requests.length}
        threadStatus={text(state.view()?.thread.status)}
        canRetract={canRetractTurn(state.view())}
        canDiscard={canDiscardTurn(state.view())}
        tokenUsage={state.view()?.tokenUsage}
        goal={state.view()?.goal}
        onCommand={props.onCommand}
        onSend={() => {
          followLatest.set(true);
          list?.scrollToEnd({ animated: false });
        }}
      />
    </View>
  );
}

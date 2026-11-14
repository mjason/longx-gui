import { effect, keymap, Scroll, signal, Text, View } from "nsh";
import { Popover } from "nsh/base";
import { type Mention, searchMentions } from "../../api/mentions";
import { AppButton as Button } from "../../components/AppButton";
import { type Completion, composerCommands } from "./composerCompletion";

export function ComposerSuggestions(props: {
  url: string;
  projectId: string;
  threadId: string;
  completion: Completion | null;
  onActivate: (kind: "@" | "/") => void;
  onInsert: (value: string, completion: Completion) => void;
  onCommand: (id: string, completion: Completion) => void;
  focusInput: () => void;
  focused: boolean;
  onPlainSubmit: () => void;
}) {
  const mentions = signal<Mention[]>([]),
    loading = signal(false),
    error = signal("");
  const dismissed = signal(""),
    highlighted = signal(0),
    key = () => JSON.stringify(props.completion);
  const commands = () =>
    composerCommands.filter(
      (command) =>
        !props.completion?.query || command.id.includes(props.completion.query.toLowerCase()),
    );
  const active = (kind: string) => props.completion?.kind === kind && dismissed() !== key();
  effect(() => {
    key();
    highlighted.set(0);
  });
  function choose() {
    const completion = props.completion;
    if (!completion) return;
    if (completion.kind === "@") {
      if (loading()) return;
      const selected = mentions()[highlighted()];
      if (selected) props.onInsert(selected.value, completion);
      else props.onPlainSubmit();
    } else {
      const selected = commands()[highlighted()];
      if (selected) props.onCommand(selected.id, completion);
      else props.onPlainSubmit();
    }
    dismissed.set(key());
  }
  effect(() => {
    if (!props.focused || !(active("@") || active("/"))) return;
    const move = (step: number) => {
      const length = props.completion?.kind === "@" ? mentions().length : commands().length;
      if (length) highlighted.set((highlighted() + step + length) % length);
    };
    const disposers = [
      keymap.bind("down", () => move(1), { when: "always", repeat: true }),
      keymap.bind("up", () => move(-1), { when: "always", repeat: true }),
      keymap.bind("enter", choose, { when: "always" }),
      keymap.bind("tab", choose, { when: "always" }),
      keymap.bind("escape", () => dismissed.set(key()), { when: "always" }),
    ];
    return () => {
      for (const dispose of disposers) dispose();
    };
  });
  effect(() => {
    const completion = props.completion,
      url = props.url,
      projectId = props.projectId,
      threadId = props.threadId;
    if (completion?.kind !== "@") return;
    const controller = new AbortController();
    let current = true;
    loading.set(true);
    error.set("");
    mentions.set([]);
    const timer = setTimeout(() => {
      void searchMentions(url, projectId, threadId, completion.query, controller.signal)
        .then((value) => {
          if (current) mentions.set(value);
        })
        .catch(() => {
          if (current) error.set("引用搜索失败，请继续输入重试。");
        })
        .finally(() => {
          if (current) loading.set(false);
        });
    }, 120);
    return () => {
      current = false;
      clearTimeout(timer);
      controller.abort();
    };
  });
  return (
    <View class="flex-row items-center gap-1">
      <Each of={["@", "/"] as const}>
        {(kind) => (
          <Popover
            open={active(kind())}
            onOpenChange={({ open }) => {
              if (open) {
                dismissed.set("");
                props.onActivate(kind());
                props.focusInput();
              } else dismissed.set(key());
            }}
            placement="top"
            align="start"
            offset={6}
            margin={12}
            popupClass="w-[360px] max-w-[90%] p-2 gap-1 rounded-lg border border-border bg-background shadow-lg"
            trigger={
              <View
                testID={kind() === "@" ? "composer-mention" : "composer-commands"}
                accessibilityLabel={kind() === "@" ? "引用文件或会话" : "输入命令"}
                class="h-7 w-7 items-center justify-center rounded hover:bg-accent"
              >
                <Text
                  class="h-5 w-5 text-sm text-center text-muted-foreground"
                  style={{ lineHeight: 16, textAlignVertical: "center" }}
                >
                  {kind()}
                </Text>
              </View>
            }
          >
            <Text class="px-2 py-1 text-xs text-quiet">
              {kind() === "@" ? "继续在输入框中输入，搜索文件或当值会话" : "选择命令"}
            </Text>
            <If when={kind() === "@"}>
              <If when={loading()}>
                <Text class="px-2 text-xs text-quiet">正在搜索…</Text>
              </If>
              <If when={!!error()}>
                <Text class="px-2 text-xs text-destructive">{error()}</Text>
              </If>
              <Scroll style={{ height: Math.min(260, mentions().length * 48) }}>
                <View class="gap-1">
                  <Each of={mentions()} key={(item) => item.value}>
                    {(item, index) => (
                      <Button
                        testID={`composer-mention-result-${index()}`}
                        class={
                          highlighted() === index()
                            ? "h-11 px-2 rounded bg-accent"
                            : "h-11 px-2 rounded hover:bg-accent"
                        }
                        onPress={() => {
                          const completion = props.completion;
                          if (completion) props.onInsert(item().value, completion);
                          dismissed.set(key());
                        }}
                      >
                        <View class="flex-1 gap-1">
                          <Text class="text-xs text-foreground" style={{ numberOfLines: 1 }}>
                            {item().group} · {item().title}
                          </Text>
                          <Text class="text-xs text-quiet" style={{ numberOfLines: 1 }}>
                            {item().detail}
                          </Text>
                        </View>
                      </Button>
                    )}
                  </Each>
                </View>
              </Scroll>
              <If when={!loading() && !mentions().length && !error()}>
                <Text class="px-2 py-2 text-xs text-quiet">
                  暂无匹配，输入文件名或会话地址继续搜索
                </Text>
              </If>
            </If>
            <If when={kind() === "/"}>
              <View class="gap-1">
                <Each of={commands()} key={(item) => item.id}>
                  {(item, index) => (
                    <Button
                      testID={`composer-command-${item().id}`}
                      class={
                        highlighted() === index()
                          ? "h-10 px-2 rounded bg-accent"
                          : "h-10 px-2 rounded hover:bg-accent"
                      }
                      onPress={() => {
                        const completion = props.completion;
                        if (completion) props.onCommand(item().id, completion);
                        dismissed.set(key());
                      }}
                    >
                      <View class="flex-1 gap-1">
                        <Text class="text-xs text-foreground" style={{ numberOfLines: 1 }}>
                          /{item().id} · {item().title}
                        </Text>
                        <Text class="text-xs text-quiet" style={{ numberOfLines: 1 }}>
                          {item().detail}
                        </Text>
                      </View>
                    </Button>
                  )}
                </Each>
              </View>
            </If>
          </Popover>
        )}
      </Each>
    </View>
  );
}

import { Scroll, signal, Text, View } from "nsh";
import { Collapsible } from "nsh/base";
import { releaseWaiting } from "../../api/composer";
import { AppButton as Button } from "../../components/AppButton";
import { Icon } from "../../components/Icon";
import { type RecordValue, record, text } from "./threadModel";

export function waitingItems(waiting: RecordValue) {
  return (
    Array.isArray(waiting.waiting)
      ? waiting.waiting
      : Array.isArray(waiting.items)
        ? waiting.items
        : []
  ).map(record);
}
export function ComposerWaiting(props: {
  url: string;
  threadId: string;
  waiting: RecordValue;
  ready: boolean;
}) {
  const open = signal(false),
    busy = signal(false),
    error = signal("");
  async function insert(id?: string) {
    if (busy() || !props.ready) return;
    const url = props.url,
      threadId = props.threadId;
    busy.set(true);
    error.set("");
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 90000);
    try {
      await releaseWaiting(url, threadId, id, controller.signal);
    } catch {
      if (props.url === url && props.threadId === threadId)
        error.set("插入结果未确认，请核对会话，不会自动重试。");
    } finally {
      clearTimeout(timer);
      busy.set(false);
    }
  }
  return (
    <If when={waitingItems(props.waiting).length > 0}>
      <View class="px-6 py-1 border-t border-border bg-surface">
        <Collapsible
          open={open()}
          content={
            <Scroll style={{ height: Math.min(160, waitingItems(props.waiting).length * 44) }}>
              <View class="gap-1">
                <Each of={waitingItems(props.waiting)} key={(item) => String(item.id)}>
                  {(item) => (
                    <View class="h-10 flex-row items-center gap-2">
                      <Text class="text-xs text-quiet">
                        {item().mine
                          ? "你"
                          : text(item().from) || text(item().source) || "外部消息"}
                      </Text>
                      <Text class="flex-1 text-xs text-foreground" style={{ numberOfLines: 2 }}>
                        {text(item().text)}
                      </Text>
                      <Button
                        testID={`composer-release-${item().id}`}
                        disabled={busy() || !props.ready}
                        class="h-7 px-2 rounded hover:bg-accent"
                        onPress={() => void insert(String(item().id))}
                      >
                        <Text class="text-xs text-primary">立即插入</Text>
                      </Button>
                    </View>
                  )}
                </Each>
              </View>
            </Scroll>
          }
        >
          <View class="h-7 flex-row items-center gap-2">
            <Button
              testID="composer-waiting-toggle"
              class="flex-1 h-7 px-2 gap-2 rounded hover:bg-accent"
              onPress={() => open.set(!open())}
            >
              <Icon name={open() ? "chevronDown" : "chevron"} size={12} />
              <Text
                class="h-5 text-xs text-quiet"
                style={{ lineHeight: 16, textAlignVertical: "center" }}
              >
                待处理消息 · {waitingItems(props.waiting).length}
              </Text>
            </Button>
            <Button
              testID="composer-release-all"
              class="h-7 px-2 rounded hover:bg-accent"
              disabled={busy() || !props.ready}
              onPress={() => void insert()}
            >
              <Text class="text-xs text-primary">全部插入</Text>
            </Button>
          </View>
        </Collapsible>
        <If when={props.waiting.paused === true}>
          <Text class="text-xs text-quiet">本轮已停止，消息等待你继续</Text>
        </If>
        <If when={!!error()}>
          <Text class="text-xs text-destructive">{error()}</Text>
        </If>
      </View>
    </If>
  );
}

import { computed, Text, View } from "nsh";
import { Collapsible } from "nsh/base";
import { AppButton as Button } from "../../components/AppButton";
import { Icon } from "../../components/Icon";
import { reasoningPresentation, reasoningRuns } from "./reasoningPresentation";
import type { ThreadItem } from "./threadModel";

function ReasoningText(props: { value: string; title?: boolean }) {
  return (
    <Text
      class={
        props.title
          ? "text-[13px] font-medium text-muted-foreground"
          : "text-[13px] text-muted-foreground"
      }
      style={{ lineHeight: 20, userSelect: "text" }}
    >
      <Each of={reasoningRuns(props.value)}>
        {(run) => (
          <Text
            class={
              run().kind === "code"
                ? "font-mono text-[12px]"
                : run().kind === "strong"
                  ? "font-medium"
                  : ""
            }
          >
            {run().text}
          </Text>
        )}
      </Each>
    </Text>
  );
}
/** Reasoning is transient process information, not an assistant Markdown document. */
export function ReasoningView(props: {
  item: ThreadItem;
  open: boolean;
  active: boolean;
  onToggle: () => void;
  onCollapse: () => void;
}) {
  const presentation = computed(() => reasoningPresentation(props.item));
  const preview = () => presentation().blocks[0]?.text ?? "暂无可显示的思考摘要";
  return (
    <View testID={`reasoning-view-${props.item.id}`} class="gap-1">
      <If when={presentation().compact}>
        <View
          testID={`reasoning-summary-${props.item.id}`}
          class="min-h-7 flex-row items-start gap-2"
        >
          <View class="w-3 h-7 items-center justify-center">
            <View
              class={
                props.active
                  ? "w-1 h-1 rounded-full bg-primary animate-pulse"
                  : "w-1 h-1 rounded-full bg-quiet"
              }
            />
          </View>
          <Text
            class="h-7 text-xs text-quiet"
            style={{ lineHeight: 16, textAlignVertical: "center" }}
          >
            思考
          </Text>
          <View class="flex-1 py-1">
            <ReasoningText value={preview()} />
          </View>
        </View>
      </If>
      <If when={!presentation().compact}>
        <Collapsible
          open={props.open}
          content={
            <View
              testID={`thread-reasoning-${props.item.id}`}
              class="ml-1 pl-4 border-l border-border gap-2 py-1"
            >
              <Each of={presentation().blocks}>
                {(block) => (
                  <View class="gap-1">
                    <If when={block().kind === "code"}>
                      <Text
                        class="font-mono text-[12px] text-muted-foreground"
                        style={{ lineHeight: 19, userSelect: "text" }}
                      >
                        {block().text}
                      </Text>
                    </If>
                    <If when={block().kind === "bullet"}>
                      <View class="flex-row items-start gap-2">
                        <Text class="text-[13px] text-quiet" style={{ lineHeight: 20 }}>
                          {block().marker}
                        </Text>
                        <View class="flex-1">
                          <ReasoningText value={block().text} />
                        </View>
                      </View>
                    </If>
                    <If when={block().kind === "title" || block().kind === "paragraph"}>
                      <ReasoningText value={block().text} title={block().kind === "title"} />
                    </If>
                  </View>
                )}
              </Each>
              <If when={!presentation().blocks.length}>
                <ReasoningText value="暂无可显示的思考摘要。" />
              </If>
              <If when={presentation().truncated}>
                <Text class="text-xs text-quiet">内容较长，仅显示前 24000 字符。</Text>
              </If>
              <Button
                testID={`thread-collapse-${props.item.id}`}
                class="h-6 px-1 self-start rounded hover:bg-accent"
                onPress={props.onCollapse}
              >
                <Text class="text-xs text-quiet">收起思考 ↑</Text>
              </Button>
            </View>
          }
        >
          <View
            testID={`thread-toggle-${props.item.id}`}
            role="button"
            accessibilityLabel="展开或收起思考过程"
            accessibilityState={{ expanded: props.open }}
            onPress={props.onToggle}
            class="h-7 flex-row items-center gap-2 rounded hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Icon name={props.open ? "chevronDown" : "chevron"} size={12} />
            <Text
              class="h-5 text-xs text-quiet"
              style={{ lineHeight: 16, textAlignVertical: "center" }}
            >
              思考过程
            </Text>
            <If when={!props.open}>
              <Text
                class="flex-1 h-5 text-xs text-muted-foreground"
                style={{ numberOfLines: 1, lineHeight: 16, textAlignVertical: "center" }}
              >
                {reasoningRuns(preview())
                  .map((run) => run.text)
                  .join("")}
              </Text>
            </If>
            <If when={props.active}>
              <View class="w-1 h-1 rounded-full bg-primary animate-pulse" />
            </If>
          </View>
        </Collapsible>
      </If>
    </View>
  );
}

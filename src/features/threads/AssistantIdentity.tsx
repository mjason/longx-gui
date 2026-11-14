import { Text, token, View } from "nsh";
import { Avatar } from "nsh/base";
import { Icon } from "../../components/Icon";
import { type RecordValue, text } from "./threadModel";

const statuses: Record<string, string> = {
  inProgress: "运行中",
  completed: "已完成",
  failed: "执行失败",
  interrupted: "已中断",
};
/** One quiet identity per loaded assistant turn; metadata is never invented. */
export function AssistantIdentity(props: { id: string; turn: RecordValue | null }) {
  const state = () => text(props.turn?.status);
  const status = () => statuses[state()] ?? "";
  return (
    <View testID={`thread-identity-${props.id}`} class="mt-5 mb-3 h-7 flex-row items-center gap-2">
      <Avatar
        name="Longx"
        accessibilityLabel=""
        class="w-7 h-7"
        fallbackClass="items-center justify-center rounded-md bg-accent"
        fallback={<Icon name="assistant" color={token("primary")} size={18} />}
      />
      <Text class="text-[13px] font-semibold text-foreground">Longx</Text>
      <Text class="flex-1 text-xs text-quiet">助手</Text>
      <Text class="text-xs text-quiet max-w-[180px] shrink" style={{ numberOfLines: 1 }}>
        {text(props.turn?.modelName) || text(props.turn?.model)}
      </Text>
      <If when={!!status()}>
        <Text class={state() === "failed" ? "text-xs text-destructive" : "text-xs text-quiet"}>
          {status()}
        </Text>
      </If>
    </View>
  );
}

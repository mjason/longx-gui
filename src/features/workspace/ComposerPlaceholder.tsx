import { Text, View } from "nsh";

/** Docked layout only: no editable input or pretend model/submit controls. */
export function ComposerPlaceholder() {
  return <View testID="composer-placeholder" class="h-[150px] px-6 py-4 border-t border-border bg-surface gap-4">
    <Text class="text-xs text-muted-foreground">继续会话</Text>
    <Text class="flex-1 text-[13px] text-quiet">会话正文与消息发送尚未接入</Text>
    <View class="h-7 flex-row items-center gap-3">
      <Text class="flex-1 text-xs text-quiet">模型与附件功能待接入</Text>
      <Text class="text-xs text-quiet">发送尚未启用</Text>
      <View class="h-7 w-10 border border-border rounded bg-muted items-center justify-center"
        accessibilityLabel="发送尚未启用"><Text class="text-base text-quiet">↑</Text></View>
    </View>
  </View>;
}

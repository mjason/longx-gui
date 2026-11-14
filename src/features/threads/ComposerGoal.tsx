import { signal, Text, View } from "nsh";
import { Dialog, Input } from "nsh/base";
import { AppButton as Button } from "../../components/AppButton";
import type { ComposerState } from "./composerState";
import { type RecordValue, text } from "./threadModel";

export function ComposerGoal(props: {
  state: ComposerState;
  goal?: RecordValue | null;
  onClose: () => void;
}) {
  const objective = signal(text(props.goal?.objective)),
    budget = signal(
      typeof props.goal?.tokenBudget === "number" ? String(props.goal.tokenBudget) : "",
    ),
    error = signal("");
  async function save() {
    const value = budget().trim() ? Number(budget()) : undefined;
    if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0 || value > 2147483647)) {
      error.set("Token 预算需为正整数，或留空。");
      return;
    }
    if (await props.state.goal(objective(), value)) props.onClose();
    else error.set("目标尚未确认，请核对会话状态。");
  }
  return (
    <Dialog
      accessibilityLabel="设置会话目标"
      animation="fade"
      onOpenChange={({ open }) => {
        if (!open && !props.state.draft()().sending) props.onClose();
      }}
      class="w-[460px] max-w-[90%] m-auto p-5 gap-3 rounded-xl border border-border bg-background shadow-lg"
      backdropClass="bg-overlay/20"
    >
      <Text class="text-base text-foreground">设置会话目标</Text>
      <Input
        testID="composer-goal-objective"
        accessibilityLabel="目标内容"
        autoFocus
        multiline
        value={objective()}
        onChange={({ value }) => objective.set(value)}
        placeholder="要持续完成的目标"
        class="h-[100px] px-3 py-2 rounded border border-border text-sm text-foreground"
      />
      <Input
        testID="composer-goal-budget"
        accessibilityLabel="Token 预算"
        value={budget()}
        onChange={({ value }) => budget.set(value)}
        placeholder="Token 预算（可选）"
        class="h-9 px-3 rounded border border-border text-sm text-foreground"
      />
      <If when={!!error()}>
        <Text class="text-xs text-destructive">{error()}</Text>
      </If>
      <View class="flex-row justify-end gap-2">
        <Button
          class="h-8 px-3 rounded hover:bg-accent"
          disabled={props.state.draft()().sending}
          onPress={props.onClose}
        >
          <Text class="text-sm text-muted-foreground">取消</Text>
        </Button>
        <Button
          testID="composer-goal-save"
          class="h-8 px-3 rounded bg-accent"
          disabled={!objective().trim() || props.state.blocked()}
          onPress={() => void save()}
        >
          <Text class="text-sm text-primary">保存目标</Text>
        </Button>
      </View>
    </Dialog>
  );
}

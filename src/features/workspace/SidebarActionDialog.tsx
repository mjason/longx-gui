import { Text, View } from "nsh";
import { Dialog, Input } from "nsh/base";
import { AppButton as Button } from "../../components/AppButton";
import type { SidebarActions } from "./sidebarActions";

export function SidebarActionDialog(props: { actions: SidebarActions }) {
  const actions = props.actions;
  const target = () => actions.target()!;
  const destructive = () => ["delete-entry", "delete-thread"].includes(target().action);
  const editing = () => !destructive() && target().action !== "archive-thread";
  const title = () =>
    ({
      file: "新建文件",
      folder: "新建文件夹",
      "rename-entry": "重命名／移动",
      "delete-entry": "删除文件或目录",
      "rename-thread": "重命名会话",
      "archive-thread": "归档会话",
      "delete-thread": "删除会话",
    })[target().action];
  return (
    <If when={!!actions.target()}>
      <Dialog
        accessibilityLabel={title()}
        onOpenChange={({ open }) => {
          if (!open) actions.close();
        }}
        class="w-[460px] max-w-[90%] m-auto p-5 gap-3 rounded-xl border border-border bg-background shadow-lg"
        backdropClass="bg-overlay/20"
      >
        <Text class="text-base text-foreground">{title()}</Text>
        <Text class="text-sm text-muted-foreground" style={{ numberOfLines: 3 }}>
          {target().entry?.path || target().thread?.title || target().root}
        </Text>
        <If when={editing()}>
          <Input
            testID="sidebar-action-input"
            accessibilityLabel={target().action === "rename-entry" ? "新的项目相对路径" : "名称"}
            autoFocus
            value={actions.value()}
            onChange={({ value }) => actions.value.set(value)}
            onSubmit={() => {
              if (!actions.busy() && !actions.uncertain()) void actions.submit();
            }}
            placeholder={target().action === "rename-entry" ? "新的项目相对路径" : "名称"}
            class="h-9 px-3 rounded border border-border text-sm text-foreground"
          />
        </If>
        <If when={destructive()}>
          <Text class="text-sm text-destructive">
            {target().thread
              ? "将删除会话及其历史记录，无法在此恢复。请先确认不再需要未发送内容和排队消息。"
              : target().entry?.kind === "dir"
                ? "将从磁盘删除整个目录及其中所有文件，不会移入废纸篓。未提交或未备份的内容可能无法恢复。"
                : "将从磁盘删除此文件，不会移入废纸篓。未提交或未备份的内容可能无法恢复。"}
          </Text>
        </If>
        <If when={target().action === "archive-thread"}>
          <Text class="text-sm text-muted-foreground">
            归档后将不能继续发送消息。此操作不是删除历史记录。
          </Text>
        </If>
        <If when={!!actions.error()}>
          <Text testID="sidebar-action-error" class="text-sm text-destructive">
            {actions.error()}
          </Text>
        </If>
        <If when={actions.uncertain()}>
          <Text class="text-xs text-muted-foreground">
            结果尚未确认，已阻止再次提交。请关闭此窗口并刷新核对。
          </Text>
        </If>
        <View class="flex-row justify-end gap-2">
          <Button
            testID="sidebar-action-cancel"
            class="h-8 px-3 rounded hover:bg-accent"
            disabled={actions.busy()}
            onPress={actions.close}
          >
            <Text class="text-sm text-muted-foreground">
              {actions.uncertain() ? "关闭并核对" : "取消"}
            </Text>
          </Button>
          <Button
            testID="sidebar-action-confirm"
            class="h-8 px-3 rounded bg-accent disabled:opacity-50"
            disabled={
              actions.busy() || actions.uncertain() || (editing() && !actions.value().trim())
            }
            onPress={() => void actions.submit()}
          >
            <Text class={destructive() ? "text-sm text-destructive" : "text-sm text-primary"}>
              {actions.busy() ? "正在处理…" : destructive() ? "确认删除" : "确认"}
            </Text>
          </Button>
        </View>
      </Dialog>
    </If>
  );
}

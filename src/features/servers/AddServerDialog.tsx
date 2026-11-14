import { signal, Text, View } from "nsh";
import { Dialog, Input } from "nsh/base";
import { AppButton as Button } from "../../components/AppButton";

interface AddServerDialogProps {
  onAdd: (name: string, address: string) => void;
  onClose: () => void;
}

/** Mounted afresh on opening, so input and errors reset between opens. */
export function AddServerDialog(props: AddServerDialogProps) {
  const name = signal("");
  const address = signal("");
  const error = signal("");
  function submit() {
    try {
      props.onAdd(name(), address());
      props.onClose();
    } catch {
      error.set("请填写有效的 HTTP / HTTPS 地址；不要包含账号、密码、查询参数或片段。");
    }
  }

  return (
    <Dialog
      accessibilityLabel="添加服务器"
      animation="fade"
      onOpenChange={(event) => {
        if (!event.open) props.onClose();
      }}
      class="w-[420px] max-w-[90%] m-auto p-5 gap-3 rounded-xl border border-border bg-background shadow-lg"
      backdropClass="bg-overlay/20"
    >
      <Text class="text-base text-foreground">添加服务器</Text>
      <Input
        testID="server-name"
        value={name()}
        onChange={(event) => name.set(event.value)}
        placeholder="显示名称（可选）"
        class="h-9 px-3 rounded-lg border border-border text-sm text-foreground"
      />
      <Input
        testID="server-address"
        autoFocus
        value={address()}
        onChange={(event) => address.set(event.value)}
        onSubmit={submit}
        placeholder="https://example.com"
        class="h-9 px-3 rounded-lg border border-border text-sm text-foreground"
      />
      <Text class="text-xs text-quiet">添加后读取服务器的项目列表；不修改远端数据。</Text>
      <If when={!!error()}>
        <Text class="text-xs text-destructive">{error()}</Text>
      </If>
      <View class="flex-row justify-end gap-3">
        <Button class="h-8 px-3" onPress={props.onClose}>
          <Text class="text-sm text-foreground">取消</Text>
        </Button>
        <Button testID="confirm-add-server" class="h-8 px-3 rounded-lg bg-accent" onPress={submit}>
          <Text class="text-sm text-primary">添加</Text>
        </Button>
      </View>
    </Dialog>
  );
}

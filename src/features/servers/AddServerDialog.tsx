import { signal, Text, View } from "nsh";
import { Dialog, Input } from "nsh/base";

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

  return <Dialog accessibilityLabel="添加服务器" animation="fade" onOpenChange={event => { if (!event.open) props.onClose(); }}
    class="w-[420px] self-center mt-20 p-5 gap-3 rounded-xl border border-[#dfe2e8] bg-white shadow-lg" backdropClass="bg-black/20">
    <Text class="text-base text-[#34383e]">添加服务器</Text>
    <Input testID="server-name" value={name()} onChange={event => name.set(event.value)} placeholder="显示名称（可选）"
      class="h-9 px-3 rounded-lg border border-[#dfe2e8] text-sm text-[#34383e]" />
    <Input testID="server-address" autoFocus value={address()} onChange={event => address.set(event.value)} onSubmit={submit}
      placeholder="https://example.com" class="h-9 px-3 rounded-lg border border-[#dfe2e8] text-sm text-[#34383e]" />
    <Text class="text-xs text-[#707785]">目前只添加当前窗口的服务器页签，不发起网络连接。</Text>
    <If when={!!error()}><Text class="text-xs text-red-600">{error()}</Text></If>
    <View class="flex-row justify-end gap-3">
      <View role="button" class="h-8 px-3 justify-center" onPress={props.onClose}>
        <Text class="text-sm text-[#34383e]">取消</Text>
      </View>
      <View testID="confirm-add-server" role="button" class="h-8 px-3 justify-center rounded-lg bg-[#d3e3fd]" onPress={submit}>
        <Text class="text-sm text-[#244b88]">添加</Text>
      </View>
    </View>
  </Dialog>;
}

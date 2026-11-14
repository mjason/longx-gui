// biome-ignore lint/style/useNodejsImportProtocol: NSH exposes this module without the node: alias.
import { readFile, stat } from "fs/promises";
import { Image, Picker, Scroll, Text, View } from "nsh";
import { AppButton as Button } from "../../components/AppButton";
import { Icon } from "../../components/Icon";
import type { ComposerState } from "./composerState";

const mimeTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  md: "text/markdown",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  html: "text/html",
  css: "text/css",
};
/** Only exact local paths explicitly supplied by a user paste/drop event. */
export async function droppedFiles(uris: string[], types: string[] = []) {
  const files: File[] = [];
  for (const [index, uri] of uris.entries()) {
    const url = new URL(uri);
    if (url.protocol !== "file:" || (url.hostname && url.hostname !== "localhost")) continue;
    const path = decodeURIComponent(url.pathname),
      info = await stat(path);
    if (!info.isFile()) throw new Error("请添加文件，不支持直接添加文件夹。");
    if (info.size > 512 * 1024 * 1024) throw new Error("单个附件不能超过 512 MiB。");
    const name = path.split("/").pop() || "attachment";
    files.push(
      new File([new Uint8Array(await readFile(path))], name, {
        type:
          types[index] ||
          mimeTypes[name.split(".").pop()?.toLowerCase() || ""] ||
          "application/octet-stream",
      }),
    );
  }
  return files;
}
export async function confirmDroppedFiles(
  uris: string[],
  types: string[],
  onNotice: (message: string) => void,
) {
  try {
    return await droppedFiles(uris, types);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      !message.includes("capabilities.fs.read") &&
      (error as { code?: string })?.code !== "ERR_ACCESS_DENIED"
    )
      throw error;
    onNotice("当前运行时不能直接读取文件路径，请在系统选择器中确认拖入／粘贴的附件。");
    const picked = await Picker.pickFiles({ multiple: true });
    onNotice(picked.length ? "" : "已取消添加文件；可用 ＋ 从系统选择器重新添加。");
    return picked.map((item) => item.file);
  }
}
export function AttachmentButton(props: {
  state: ComposerState;
  onError: (error: string) => void;
}) {
  async function pick() {
    const attach = props.state.captureAttachments(),
      scope = props.state.scope();
    try {
      const picked = await Picker.pickFiles({ multiple: true });
      await attach(picked.map((item) => item.file));
    } catch (error) {
      if (scope === props.state.scope())
        props.onError(error instanceof Error ? error.message : "无法选择附件。");
    }
  }
  return (
    <Button
      testID="composer-attach"
      accessibilityLabel="添加图片或文件"
      class="h-7 w-7 rounded hover:bg-accent"
      onPress={() => void pick()}
    >
      <Icon name="plus" size={16} />
    </Button>
  );
}
export function ComposerAttachments(props: { state: ComposerState }) {
  return (
    <If when={props.state.draft()().attachments.length > 0}>
      <Scroll horizontal class="h-[68px]">
        <View class="flex-row gap-2">
          <Each of={props.state.draft()().attachments} key={(item) => item.id}>
            {(item) => (
              <View
                testID={`composer-attachment-${item().name}`}
                class="h-[60px] max-w-[240px] flex-row items-center gap-2 px-2 rounded border border-border bg-background"
              >
                <If when={!!item().image}>
                  <Image
                    src={item().image!}
                    class="w-10 h-10 rounded"
                    style={{ objectFit: "contain" }}
                  />
                </If>
                <View class="shrink gap-1">
                  <Text class="text-xs text-foreground" style={{ numberOfLines: 1 }}>
                    {item().name}
                  </Text>
                  <Text
                    class={
                      item().status === "failed" ? "text-xs text-destructive" : "text-xs text-quiet"
                    }
                    style={{ numberOfLines: 2 }}
                  >
                    {item().status === "preparing"
                      ? "准备附件…"
                      : item().status === "failed"
                        ? item().error
                        : `${Math.max(1, Math.round(item().size / 1024))} KiB`}
                  </Text>
                </View>
                <Button
                  testID={`composer-remove-${item().name}`}
                  accessibilityLabel={`移除附件 ${item().name}`}
                  disabled={props.state.draft()().sending}
                  class="h-7 w-7 rounded hover:bg-accent"
                  onPress={() => props.state.removeAttachment(item().id)}
                >
                  <Text class="text-xs text-quiet">×</Text>
                </Button>
              </View>
            )}
          </Each>
        </View>
      </Scroll>
    </If>
  );
}

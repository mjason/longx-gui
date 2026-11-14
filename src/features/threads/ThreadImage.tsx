import { effect, Image, signal, Text, View } from "nsh";

/** Never interpret a server-provided path as a local file. */
export function threadImageSource(value: string, baseUrl: string): string {
  if (!value) return "";
  if (/^data:image\/[a-z0-9.+-]+[;,]/i.test(value)) return value;
  try {
    const url = new URL(value, baseUrl);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}

export function ThreadImage(props: {
  src: string;
  baseUrl: string;
  alt?: string;
  id?: string;
  width?: number;
}) {
  const failed = signal(false);
  const ratio = signal(4 / 3);
  effect(() => {
    threadImageSource(props.src, props.baseUrl);
    failed.set(false);
    ratio.set(4 / 3);
  });
  return (
    <View testID={props.id} class="max-w-full my-2 gap-1" style={{ width: props.width ?? 560 }}>
      <If when={!!threadImageSource(props.src, props.baseUrl) && !failed()}>
        <Image
          src={threadImageSource(props.src, props.baseUrl)}
          accessibilityLabel={props.alt || "会话图片"}
          class="w-full rounded-md"
          style={{ aspectRatio: ratio(), maxHeight: 420, objectFit: "contain" }}
          onLoad={({ size }) => {
            if (size.width > 0 && size.height > 0) ratio.set(size.width / size.height);
          }}
          onError={() => failed.set(true)}
        />
      </If>
      <If when={!threadImageSource(props.src, props.baseUrl) || failed()}>
        <Text class="text-xs text-quiet">{`图片无法加载${props.alt ? `：${props.alt}` : ""}`}</Text>
      </If>
    </View>
  );
}

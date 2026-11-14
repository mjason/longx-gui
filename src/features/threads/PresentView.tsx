import { computed, Scroll, Text, View } from "nsh";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TextView } from "nsh/base";
import { ThreadImage } from "./ThreadImage";
import { record, text } from "./threadModel";
import { type ViewNode, viewNodes } from "./threadViews";

const containers = new Set(["Card", "Col", "Row", "Box", "ListView", "ListViewItem", "Carousel"]);
const textTypes = new Set(["Text", "Header", "Caption", "Badge", "Alert"]);
const scalar = (value: unknown) =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "";

function NativeNode(props: { node: ViewNode; baseUrl: string; width: number }) {
  const type = () => props.node.type;
  const p = () => props.node.props;
  const content = () => props.node.value ?? scalar(p().text ?? p().value);
  const children = () => props.node.children;
  const columns = () => (Array.isArray(p().columns) ? (p().columns as unknown[]).slice(0, 32) : []);
  const rows = () => (Array.isArray(p().rows) ? (p().rows as unknown[]).slice(0, 200) : []);
  const known = () =>
    containers.has(type()) ||
    textTypes.has(type()) ||
    ["Image", "Table", "Markdown", "Fact", "Divider", "Spacer"].includes(type());
  return (
    <View class="min-w-0">
      <If when={containers.has(type())}>
        <View class={type() === "Row" ? "flex-row flex-wrap items-center gap-3" : "gap-2"}>
          <If when={!!text(p().title)}>
            <Text class="text-sm font-semibold text-foreground">{text(p().title)}</Text>
          </If>
          <Each of={children()}>
            {(child) => <NativeNode node={child()} baseUrl={props.baseUrl} width={props.width} />}
          </Each>
          <If when={!!p().confirm || !!p().cancel}>
            <Text class="text-xs text-quiet">此卡片包含交互操作，暂请在网页端处理。</Text>
          </If>
        </View>
      </If>
      <If when={textTypes.has(type())}>
        <View
          class={type() === "Alert" ? "p-3 rounded border border-border bg-muted gap-1" : "gap-1"}
        >
          <Text
            class={
              type() === "Header"
                ? "text-base font-semibold text-foreground"
                : type() === "Caption"
                  ? "text-xs text-muted-foreground"
                  : "text-sm text-foreground"
            }
            style={{ lineHeight: 22, userSelect: "text" }}
          >
            {content()}
          </Text>
          <Each of={children()}>
            {(child) => <NativeNode node={child()} baseUrl={props.baseUrl} width={props.width} />}
          </Each>
        </View>
      </If>
      <If when={type() === "Image"}>
        <ThreadImage
          src={text(p().src)}
          alt={text(p().alt)}
          baseUrl={props.baseUrl}
          width={props.width}
        />
      </If>
      <If when={type() === "Markdown"}>
        <TextView
          markdown={text(p().value)}
          selectable
          class="text-sm text-foreground"
          styles={{ root: { fontSize: 14, lineHeight: 24 } }}
          renderImage={(image) => (
            <ThreadImage
              src={image.src}
              alt={image.alt}
              baseUrl={props.baseUrl}
              width={props.width}
            />
          )}
        />
      </If>
      <If when={type() === "Fact"}>
        <View class="flex-row flex-wrap items-center gap-2">
          <Text class="text-xs text-muted-foreground">{scalar(p().label)}</Text>
          <Text class="text-sm font-medium text-foreground">{scalar(p().value)}</Text>
        </View>
      </If>
      <If when={type() === "Divider"}>
        <View class="h-px bg-border my-2" />
      </If>
      <If when={type() === "Spacer"}>
        <View class="h-2" />
      </If>
      <If when={type() === "Table"}>
        <Scroll horizontal style={{ maxWidth: props.width, height: (rows().length + 1) * 44 }}>
          <Table accessibilityLabel="会话表格">
            <TableHeader>
              <TableRow class="border-b border-border">
                <Each of={columns()}>
                  {(column) => (
                    <TableHead class="w-40 px-3 py-2 justify-center">
                      <Text class="text-sm font-medium text-foreground">
                        {scalar(record(column()).label)}
                      </Text>
                    </TableHead>
                  )}
                </Each>
              </TableRow>
            </TableHeader>
            <TableBody>
              <Each of={rows()}>
                {(row) => (
                  <TableRow class="border-b border-border">
                    <Each of={columns().map((_, index) => index)}>
                      {(index) => (
                        <TableCell class="w-40 px-3 py-2 justify-center">
                          <Text class="text-sm text-foreground" style={{ userSelect: "text" }}>
                            {scalar(Array.isArray(row()) ? (row() as unknown[])[index()] : "")}
                          </Text>
                        </TableCell>
                      )}
                    </Each>
                  </TableRow>
                )}
              </Each>
            </TableBody>
          </Table>
        </Scroll>
        <If when={Array.isArray(p().rows) && (p().rows as unknown[]).length > 200}>
          <Text class="text-xs text-quiet">仅显示前 200 行。</Text>
        </If>
      </If>
      <If when={!known()}>
        <Text class="text-xs text-muted-foreground">
          {props.node.value ||
            `暂不支持的组件：${type()}${text(p().label) ? ` · ${text(p().label)}` : ""}；交互操作请在网页端处理。`}
        </Text>
      </If>
    </View>
  );
}
export function PresentView(props: { tree: unknown; baseUrl: string; width: number; id?: string }) {
  const nodes = computed(() => viewNodes(props.tree));
  return (
    <View testID={props.id} class="gap-3 min-w-0" style={{ maxWidth: props.width }}>
      <Each of={nodes()}>
        {(node) => <NativeNode node={node()} baseUrl={props.baseUrl} width={props.width} />}
      </Each>
      <If when={!nodes().length}>
        <Text class="text-xs text-quiet">正在接收视图内容…</Text>
      </If>
    </View>
  );
}

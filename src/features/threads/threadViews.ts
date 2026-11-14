import { record, type ThreadItem, text } from "./threadModel";

export function isPresentItem(item: ThreadItem) {
  return item.type === "dynamicToolCall" && item.namespace === "longx" && item.tool === "present";
}
export function isImageViewItem(item: ThreadItem) {
  return (
    item.type === "dynamicToolCall" && item.namespace === "view_image" && item.tool === "view_image"
  );
}
export function isThreadView(item: ThreadItem) {
  return isPresentItem(item) || isImageViewItem(item);
}
export function presentTree(item: ThreadItem): unknown {
  const args = item.arguments;
  if (typeof args !== "string") return args;
  try {
    return JSON.parse(args);
  } catch {
    return null;
  }
}
/** Only use a server-confirmed attachment. Never turn an arbitrary local path into a URL. */
export function toolImageSource(item: ThreadItem, projectId: string) {
  const details = record(item.details);
  if (
    item.success === false ||
    details.attachment !== true ||
    !text(details.mime).startsWith("image/") ||
    !projectId
  )
    return "";
  const path = text(details.path);
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((p) => !p || p === "." || p === "..")
  )
    return "";
  return `/files/${encodeURIComponent(projectId)}/_attachments/${path.split("/").map(encodeURIComponent).join("/")}?inline=1`;
}

export interface ViewNode {
  type: string;
  props: Record<string, unknown>;
  children: ViewNode[];
  value?: string;
}
/** Bounded, declarative data only. No source execution, event props, or arbitrary native props. */
export function viewNodes(value: unknown): ViewNode[] {
  let count = 0;
  function visit(value: unknown, depth: number): ViewNode[] {
    if (value == null || typeof value === "boolean") return [];
    if (count > 512) return [];
    if (++count > 512 || depth > 16)
      return [{ type: "Unsupported", props: {}, children: [], value: "内容过长，未继续展开。" }];
    if (typeof value === "string" || typeof value === "number")
      return [{ type: "Text", props: {}, children: [], value: String(value) }];
    if (Array.isArray(value)) return value.slice(0, 100).flatMap((v) => visit(v, depth + 1));
    const node = record(value);
    const legacy = typeof node.component === "string";
    const props = legacy ? record(node.props) : node;
    return [
      {
        type: text(legacy ? node.component : node.$type) || "Unsupported",
        props,
        children: visit(node.children, depth + 1),
      },
    ];
  }
  return visit(value, 0);
}

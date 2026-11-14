import { signal } from "nsh";
import type { DockAreaLayout, DockNode } from "nsh/base";
import type { ContentTab } from "./contentTabs";

const tools = ["files", "conversations", "git", "agent"];
export function groupPanels(layout: DockAreaLayout, group: number): string[] {
  function find(node: DockNode): string[] | undefined {
    if (node.type === "tabs") return node.id === group ? node.panels : undefined;
    for (const child of node.children) {
      const result = find(child);
      if (result) return result;
    }
    return undefined;
  }
  for (const node of [
    layout.center,
    layout.left?.layout,
    layout.right?.layout,
    layout.bottom?.layout,
  ]) {
    const result = node && find(node);
    if (result) return result;
  }
  return [];
}
function mapNodes(layout: DockAreaLayout, visit: (node: DockNode) => DockNode): DockAreaLayout {
  function walk(node: DockNode): DockNode {
    return visit(node.type === "split" ? { ...node, children: node.children.map(walk) } : node);
  }
  return {
    ...layout,
    center: walk(layout.center),
    left: layout.left ? { ...layout.left, layout: walk(layout.left.layout) } : null,
    right: layout.right ? { ...layout.right, layout: walk(layout.right.layout) } : null,
    bottom: layout.bottom ? { ...layout.bottom, layout: walk(layout.bottom.layout) } : null,
  };
}
export function createNativeDock() {
  const layout = signal<DockAreaLayout>({
    center: {
      type: "split",
      id: 1,
      axis: "horizontal",
      children: [{ type: "tabs", id: 10, panels: ["welcome"] }],
    },
    left: {
      open: true,
      size: 248,
      layout: {
        type: "split",
        id: 20,
        axis: "vertical",
        children: [
          { type: "tabs", id: 21, panels: ["files", "git", "agent"] },
          { type: "tabs", id: 22, panels: ["conversations"] },
        ],
        sizes: [null, 210],
      },
    },
  });
  return {
    layout,
    reconcile(items: ContentTab[], active: string | null, open: boolean) {
      const ids = items.length ? items.map((item) => item.id) : ["welcome"];
      const allowed = new Set([...tools, ...ids]);
      layout.update((previous) => {
        const found = new Set<string>();
        let next = mapNodes(previous, (node) => {
          if (node.type !== "tabs") return node;
          const selected = node.panels[node.activeIndex ?? 0];
          const panels = node.panels.filter((id) => allowed.has(id));
          panels.forEach((id) => {
            found.add(id);
          });
          return { ...node, panels, activeIndex: Math.max(0, panels.indexOf(selected)) };
        });
        const missing = ids.filter((id) => !found.has(id));
        let inserted = false;
        function insert(node: DockNode): DockNode {
          if (node.type === "tabs" && !inserted) {
            inserted = true;
            const panels = [...node.panels, ...missing];
            return {
              ...node,
              panels,
              activeIndex: Math.max(0, panels.indexOf(active ?? "welcome")),
            };
          }
          return node.type === "split" ? { ...node, children: node.children.map(insert) } : node;
        }
        if (missing.length) {
          let center = insert(next.center);
          if (!inserted) {
            const panel: DockNode = {
              type: "tabs",
              panels: missing,
              activeIndex: Math.max(0, missing.indexOf(active ?? "welcome")),
            };
            center =
              center.type === "split"
                ? { ...center, children: [...center.children, panel] }
                : { type: "split", axis: "horizontal", children: [center, panel] };
          }
          next = { ...next, center };
        }
        return { ...next, left: next.left ? { ...next.left, open } : null };
      });
    },
  };
}

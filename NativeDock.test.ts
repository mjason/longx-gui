import type { DockAreaLayout, DockNode } from "nsh/base";
import { expect, test } from "nsh/test";
import type { ContentTab } from "./src/features/workspace/contentTabs";
import { createNativeDock } from "./src/features/workspace/nativeDock";

const file: ContentTab = {
  id: "file:a.ts",
  kind: "file",
  title: "a.ts",
  file: { name: "a.ts", path: "a.ts", kind: "file", size: 1 },
};
const chat: ContentTab = {
  id: "chat:t1",
  kind: "chat",
  title: "Chat",
  thread: { id: "t1", title: "Chat", status: "idle" },
};
function panels(node: DockNode): string[] {
  return node.type === "tabs" ? node.panels : node.children.flatMap(panels);
}
function all(layout: DockAreaLayout) {
  return [
    ...panels(layout.center),
    ...(layout.left ? panels(layout.left.layout) : []),
    ...(layout.right ? panels(layout.right.layout) : []),
    ...(layout.bottom ? panels(layout.bottom.layout) : []),
  ];
}

test("reconciles document tabs without resetting native resized or moved layout", () => {
  const dock = createNativeDock();
  dock.reconcile([file, chat], file.id, true);
  const moved: DockAreaLayout = {
    ...dock.layout(),
    center: {
      type: "split",
      id: 1,
      axis: "horizontal",
      children: [{ type: "tabs", id: 10, panels: [chat.id] }],
    },
    left: {
      size: 330,
      open: true,
      layout: {
        type: "split",
        id: 20,
        axis: "vertical",
        sizes: [null, 160],
        children: [
          { type: "tabs", id: 21, panels: ["files", file.id] },
          { type: "tabs", id: 22, panels: ["conversations"] },
        ],
      },
    },
  };
  dock.layout.set(moved);
  dock.reconcile([file, chat], chat.id, true);
  expect(dock.layout().left?.size).toBe(330);
  expect(panels(dock.layout().left!.layout)).toContain(file.id);
  expect(all(dock.layout()).filter((id) => id === file.id).length).toBe(1);
  dock.reconcile([chat], chat.id, false);
  expect(all(dock.layout()).includes(file.id)).toBe(false);
  expect(dock.layout().left?.open).toBe(false);
  expect(dock.layout().left?.size).toBe(330);
});

test("restores an empty center after every content tab was moved out and closed", () => {
  const dock = createNativeDock();
  dock.layout.update((layout) => ({
    ...layout,
    center: { type: "split", id: 1, axis: "horizontal", children: [] },
  }));
  dock.reconcile([], null, true);
  expect(panels(dock.layout().center)).toEqual(["welcome"]);
  dock.reconcile([file], file.id, true);
  expect(panels(dock.layout().center)).toEqual([file.id]);
});

test("does not reactivate a document over the selected Git tab in another group", () => {
  const dock = createNativeDock();
  dock.layout.update((layout) => ({
    ...layout,
    center: {
      type: "split",
      id: 1,
      axis: "horizontal",
      children: [{ type: "tabs", id: 10, panels: [chat.id] }],
    },
    left: {
      size: 248,
      open: true,
      layout: { type: "tabs", id: 21, panels: ["files", "git", file.id], activeIndex: 1 },
    },
  }));
  dock.reconcile([file, chat], file.id, true);
  const left = dock.layout().left!.layout;
  expect(left.type === "tabs" ? left.panels[left.activeIndex ?? 0] : null).toBe("git");
});

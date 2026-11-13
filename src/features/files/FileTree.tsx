import { token, Text, View } from "nsh";
import { Tree } from "nsh/base";
import { Icon } from "../../components/Icon";
import type { FileEntry } from "../../api/client";
import type { FileTreeState } from "./treeState";

export function FileTree(props: { state: FileTreeState; onOpen: (file: FileEntry) => void }) {
  const state = props.state;
  // Rebuild only the native viewport when filtering. Large virtualized folder
  // lists can otherwise retain stale visible-row caches after children shrink.
  // The controlled selection/expansion and loaded directories stay in state.
  return <Each of={[state.filter().trim().toLowerCase()]} key={value => value}>{() =>
  <Tree testID="file-tree" accessibilityLabel="项目文件目录" class="flex-1 font-sans"
    items={state.items()} expanded={state.visibleExpanded()} selected={state.selected()}
    onExpandedChange={event => state.expanded.set(event.expanded)}
    onSelectedChange={event => state.selected.set(event.selected)}
    onExpand={event => { void state.expand(event.id); }}
    onAction={event => {
      const file = state.entry(event.id);
      if (file && file.kind !== "dir") props.onOpen(file);
    }}
    listClass="px-2 py-1"
    itemClass="group h-6 px-2 rounded hover:bg-accent selected:bg-accent focus-visible:ring-2 focus-visible:ring-primary"
    itemStyle={{ fontSize: 13, fontWeight: 400, color: token("foreground"), lineHeight: 20 }}
    renderItem={item =>
      <View testID={item.disabled ? `file-tree-status-${item.id}` : `file-entry-${item.id.slice(6)}`}
        class="h-6 flex-row items-center gap-[6px]" style={{ paddingLeft: 14 + item.depth * 14 }}>
        <View class="w-3 items-center">
          <If when={item.folder}>
            <View class="group-aria-expanded:rotate-90"><Icon name="chevron" size={12} color={token("muted-foreground")} /></View>
          </If>
        </View>
        <If when={!item.disabled}><Icon name={item.folder ? "folder" : "file"} size={15} color={token("quiet")} /></If>
        <Text testID={`file-label-${item.id.slice(6)}`}
          class={item.disabled ? "flex-1 font-sans font-normal text-[12px] text-quiet" : "flex-1 font-sans font-normal text-[13px] text-foreground"}
          style={{ numberOfLines: 1, lineHeight: 20 }}>{item.label}</Text>
      </View>
    } />
  }</Each>;
}

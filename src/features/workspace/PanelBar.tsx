import { token, View } from "nsh";
import { Icon } from "../../components/Icon";

export type Panel = "chat" | "branch" | "bot" | "folder";
const items: { id: Panel; label: string }[] = [
  { id: "folder", label: "文件" }, { id: "chat", label: "会话" },
  { id: "branch", label: "Git" }, { id: "bot", label: "智能体" },
];

/** Compact panel toggles live in the bottom bar, not an activity rail. */
export function PanelBar(props: { selected: (panel: Panel) => boolean; onSelect: (panel: Panel) => void }) {
  return <View testID="panel-bar" class="h-6 flex-row items-center gap-1">
    <Each of={items}>{item =>
      <View testID={`nav-${item().id}`} role="button" accessibilityLabel={item().label} onPress={() => props.onSelect(item().id)}
        class={props.selected(item().id)
          ? "h-5 w-7 rounded items-center justify-center bg-accent"
          : "h-5 w-7 rounded items-center justify-center hover:bg-accent"}>
        <Icon name={item().id} size={16} color={props.selected(item().id) ? token("primary") : token("quiet")} />
      </View>
    }</Each>
  </View>;
}

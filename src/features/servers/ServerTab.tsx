import { Image, Text, View, type Accessor } from "nsh";
import { Tab } from "nsh/base";
import closeIcon from "../../../assets/close.svg";
import type { Server } from "./types";

interface ServerTabProps {
  server: Accessor<Server>;
  selected: Accessor<boolean>;
  width: Accessor<number>;
  separator: Accessor<boolean>;
  onSelect: () => void;
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

/** Owns the tab silhouette, inverse bottom corners and close hit target. */
export function ServerTab(props: ServerTabProps) {
  return <View style={{ width: props.width(), overflow: "visible" }}
    onMouseEnter={props.onMouseEnter} onMouseLeave={props.onMouseLeave}>
    <Tab testID={`top-tab-${props.server().id}`} selected={props.selected()} onPress={props.onSelect}
      class={props.selected()
        ? "h-[34px] pb-[6px] px-3 flex-row items-center gap-2 bg-white"
        : "h-7 mb-[6px] px-3 flex-row items-center gap-2 hover:bg-[#aecbfa]"}
      style={{ width: props.width(), zIndex: props.selected() ? 2 : 0, overflow: "visible",
        borderTopLeftRadius: 10, borderTopRightRadius: 10,
        borderBottomLeftRadius: props.selected() ? 0 : 10, borderBottomRightRadius: props.selected() ? 0 : 10 }}>
      <If when={props.selected()}>
        <View testID={`server-selected-${props.server().id}`} class="absolute h-1 w-1" />
        <View class="absolute bottom-0 -left-[10px] h-[10px] w-[10px] bg-white">
          <View class="h-[10px] w-[10px] bg-[#d3e3fd]" style={{ borderBottomRightRadius: 10 }} />
        </View>
        <View class="absolute bottom-0 -right-[10px] h-[10px] w-[10px] bg-white">
          <View class="h-[10px] w-[10px] bg-[#d3e3fd]" style={{ borderBottomLeftRadius: 10 }} />
        </View>
      </If>
      <Image testID={`server-icon-${props.server().id}-${props.server().icon.variant}`} src={props.server().icon.src}
        class="h-4 w-4 shrink-0" style={{ tintColor: props.server().icon.color }} />
      <Text class="flex-1 text-[13px] text-[#34383e]" style={{ numberOfLines: 1 }}>{props.server().name}</Text>
      <View testID={`close-server-${props.server().id}`} role="button" accessibilityLabel={`关闭${props.server().name}`}
        desktop={{ windowDrag: false }} onPress={props.onClose}
        class="h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-[#00000014]">
        <Image src={closeIcon} class="h-3 w-3" style={{ tintColor: "#4b535e" }} />
      </View>
    </Tab>
    <If when={props.separator()}>
      <View testID={`server-separator-${props.server().id}`} class="absolute w-[2px] h-4 bg-[#a8c7fa]"
        style={{ right: -6, top: 6 }} />
    </If>
  </View>;
}

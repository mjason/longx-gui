import { Scroll, signal, Text, View, type Accessor, type ScrollRef } from "nsh";
import { Tabs } from "nsh/base";
import { titleBar } from "nsh/desktop";
import { ServerTab } from "./ServerTab";
import type { Server } from "./types";

interface ServerTabBarProps {
  servers: Accessor<Server[]>;
  selected: Accessor<number>;
  onSelect: (id: number) => void;
  onClose: (id: number) => void;
  onAdd: () => void;
  scrollRef: (value: ScrollRef) => void;
}

/** Native titlebar layout and transient hover state stay with the strip. */
export function ServerTabBar(props: ServerTabBarProps) {
  const hovered = signal<number | null>(null);
  const available = signal(1000);
  const tabWidth = () => Math.max(128, Math.min(220, (available() - 56) / Math.max(1, props.servers().length) - 10));
  const stripWidth = () => Math.max(0, Math.min(available() - 40, props.servers().length * (tabWidth() + 10) + 16));

  function showSeparator(id: number) {
    const index = props.servers().findIndex(server => server.id === id);
    const next = props.servers()[index + 1]?.id;
    return props.selected() !== id && props.selected() !== next && hovered() !== id && hovered() !== next;
  }

  return <View testID="top-bar" desktop={{ windowDrag: true }}
    class="h-10 flex-row items-end bg-[#d3e3fd]"
    onLayout={event => available.set(Math.max(0, event.bounds.size.width - titleBar().left - titleBar().right - 16))}
    style={{ paddingLeft: titleBar().left + 8, paddingRight: titleBar().right + 8 }}>
    <Scroll horizontal ref={props.scrollRef} class="h-10 shrink-0" style={{ width: stripWidth() }}>
      <Tabs class="h-10 flex-row items-end gap-[10px] px-[10px]" style={{ overflow: "visible" }}>
        <Each of={props.servers()} key={server => server.id}>{server =>
          <ServerTab server={server} selected={() => props.selected() === server().id} width={tabWidth}
            separator={() => showSeparator(server().id)}
            onSelect={() => props.onSelect(server().id)}
            onClose={() => {
              if (hovered() === server().id) hovered.set(null);
              props.onClose(server().id);
            }}
            onMouseEnter={() => hovered.set(server().id)}
            onMouseLeave={() => { if (hovered() === server().id) hovered.set(null); }} />
        }</Each>
      </Tabs>
    </Scroll>
    <View testID="add-server" role="button" accessibilityLabel="添加服务器"
      desktop={{ windowDrag: false }} class="h-7 w-7 mb-[6px] ml-1 items-center justify-center rounded-full hover:bg-[#bbd3f6]"
      onPress={props.onAdd}>
      <Text class="text-xl text-[#34383e]">+</Text>
    </View>
    <View testID="titlebar-drag-region" class="flex-1 h-10" desktop={{ windowDrag: true }} />
  </View>;
}

import { Scroll, Text, View, token } from "nsh";
import { Tab, Tabs } from "nsh/base";
import { Icon } from "../../components/Icon";
import type { ContentTabsState } from "./contentTabs";

/** Flat, 32pt document tabs matching the approved workspace design. */
export function WorkspaceTabs(props: { state: ContentTabsState; onToggleSidebar: () => void }) {
  const state = props.state;
  return <View testID="workspace-tabs" class="h-8 flex-row border-b border-border bg-muted">
    <Scroll horizontal class="flex-1 h-8">
      <Tabs class="h-8 flex-row">
        <If when={state.items().length === 0}>
          <Tab selected class="h-8 w-[196px] px-3 gap-2 flex-row items-center border-r border-border bg-background">
            <View class="absolute top-0 left-0 right-0 h-[2px] bg-primary" />
            <Icon name="chat" size={15} color={token("primary")} />
            <Text class="flex-1 text-[13px] font-medium text-foreground">工作区</Text>
          </Tab>
        </If>
        <Each of={state.items()} key={item => item.id}>{item =>
          <Tab testID={`content-tab-${item().id}`} selected={state.active() === item().id}
            onPress={() => state.select(item().id)}
            style={{ width: item().kind === "file" ? 222 : 196 }}
            class={state.active() === item().id
              ? "h-8 px-3 gap-2 flex-row items-center border-r border-border bg-background"
              : "h-8 px-3 gap-2 flex-row items-center border-r border-border hover:bg-surface"}>
            <If when={state.active() === item().id}>
              <View testID="content-tab-indicator" class="absolute top-0 left-0 right-0 h-[2px] bg-primary" />
            </If>
            <Icon name={item().kind === "file" ? "file" : "chat"} size={15}
              color={state.active() === item().id ? token("primary") : token("quiet")} />
            <Text class={state.active() === item().id ? "flex-1 text-[13px] font-medium text-foreground" : "flex-1 text-[13px] text-muted-foreground"}
              style={{ numberOfLines: 1 }}>{item().title}</Text>
            <View testID={`close-content-${item().id}`} role="button" accessibilityLabel={`关闭${item().title}`}
              onPress={() => state.close(item().id)}
              class="h-5 w-5 items-center justify-center rounded hover:bg-accent">
              <Icon name="close" size={12} />
            </View>
          </Tab>
        }</Each>
      </Tabs>
    </Scroll>
    <View testID="toggle-sidebar" role="button" accessibilityLabel="切换侧栏" onPress={props.onToggleSidebar}
      class="h-8 w-8 items-center justify-center hover:bg-surface"><Icon name="panel" size={15} /></View>
  </View>;
}

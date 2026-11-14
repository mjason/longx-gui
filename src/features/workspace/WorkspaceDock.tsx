import { effect, type JSX, type Signal, signal, Text, View } from "nsh";
import { DockArea, type DockAreaRef } from "nsh/base";
import { AppButton as Button } from "../../components/AppButton";
import { Icon } from "../../components/Icon";
import type { ContentTabsState } from "./contentTabs";
import type { DockState } from "./dockState";
import { createNativeDock, groupPanels } from "./nativeDock";

export function WorkspaceDock(props: {
  tabs: ContentTabsState;
  dock: DockState;
  onClose: (id: string) => void;
  dirty: (path: string) => boolean;
  renderPanel: (id: string) => JSX.Element;
  onSearch: () => void;
  projectName: string;
  conversationCount: number;
  rootExpanded: Signal<boolean>;
}) {
  const native = createNativeDock();
  const panelWidths = signal<Record<string, number>>({});
  const conversationsVisible = () => props.dock.chats() && props.dock.auxiliary() !== "branch";
  let ref: DockAreaRef | undefined;
  effect(() => {
    native.reconcile(props.tabs.items(), props.tabs.active(), props.dock.visible());
    ref?.setDockOpen("left", props.dock.visible());
  });
  effect(() => {
    const auxiliary = props.dock.auxiliary(),
      files = props.dock.files();
    const panel =
      auxiliary === "branch" ? "git" : auxiliary === "bot" ? "agent" : files ? "files" : null;
    if (panel)
      requestAnimationFrame(() => {
        const current = props.dock.auxiliary();
        const target =
          current === "branch"
            ? "git"
            : current === "bot"
              ? "agent"
              : props.dock.files()
                ? "files"
                : null;
        if (target === panel) ref?.selectPanel(panel);
      });
  });
  effect(() => {
    if (conversationsVisible())
      requestAnimationFrame(() => {
        if (conversationsVisible()) ref?.selectPanel("conversations");
      });
  });
  effect(() => {
    const request = props.tabs.selectionRequest();
    if (request)
      requestAnimationFrame(() => {
        if (
          props.tabs.selectionRequest()?.version === request.version &&
          props.tabs.items().some((item) => item.id === request.id)
        ) {
          ref?.selectPanel(request.id);
        }
      });
  });
  const title = (id: string) =>
    props.tabs.items().find((item) => item.id === id)?.title ??
    { welcome: "工作区", files: "文件", conversations: "会话", git: "Git", agent: "智能体" }[id] ??
    id;
  function visible(id: string) {
    return id === "files"
      ? props.dock.files() && !props.dock.auxiliary()
      : id === "conversations"
        ? conversationsVisible()
        : id === "git"
          ? props.dock.auxiliary() === "branch"
          : id === "agent"
            ? props.dock.auxiliary() === "bot"
            : true;
  }
  function headerWidth(panel: string, group: number, content: boolean) {
    if (content) return 222;
    const single = groupPanels(native.layout(), group).filter(visible).length === 1;
    // Measure the actual native panel, so a standalone tool header fills its
    // group after resizing or moving. Mixed groups keep compact, shrinkable tabs.
    return single ? (panelWidths()[panel] ?? native.layout().left?.size ?? 248) : 150;
  }
  return (
    <DockArea
      testID="workspace-dock"
      ref={(value) => {
        ref = value;
      }}
      class="flex-1 bg-background"
      layout={native.layout()}
      onLayoutChange={(event) => native.layout.set(event.layout)}
      onDockOpenChange={(event) => {
        if (event.placement === "left") props.dock.open.set(event.open);
      }}
      onPanelActiveChange={(event) => {
        if (event.active && props.tabs.items().some((item) => item.id === event.panel))
          props.tabs.select(event.panel);
      }}
      panels={[
        { id: "files", visible: props.dock.files() && !props.dock.auxiliary(), closable: false },
        { id: "conversations", visible: conversationsVisible(), closable: false },
        { id: "git", visible: props.dock.auxiliary() === "branch", closable: false },
        { id: "agent", visible: props.dock.auxiliary() === "bot", closable: false },
        { id: "welcome", closable: false },
        ...props.tabs.items().map((item) => ({ id: item.id, closable: false })),
      ]}
      tabBarClass="h-8 flex-row bg-muted border-b border-border"
      tabClass="group h-8 shrink min-w-0"
      groupClass="bg-background"
      contentClass="flex-1 bg-background"
      dockClass="bg-sidebar"
      handleClass="bg-border group-hover:bg-primary group-active:bg-primary"
      handleAccessibilityLabel="调整停靠面板大小"
      dropIndicatorClass="bg-primary/20 border border-primary"
      drawerClass="bg-sidebar border-r border-border"
      backdropClass="bg-overlay/20"
      renderPanel={(panel) => (
        <View
          class="flex-1"
          onLayout={(event) => {
            if (panel.id.includes(":") || panel.id === "welcome") return;
            const width = event.bounds.size.width;
            if (width > 0 && Math.abs((panelWidths()[panel.id] ?? 0) - width) > 0.5) {
              panelWidths.update((values) => ({ ...values, [panel.id]: width }));
            }
          }}
        >
          {props.renderPanel(panel.id)}
        </View>
      )}
      renderTab={(tab) => {
        const item = () => props.tabs.items().find((item) => item.id === tab.panel);
        const isContent = tab.panel === "welcome" || tab.panel.includes(":");
        return (
          <View
            testID={isContent ? `content-tab-${tab.panel}` : `dock-tab-${tab.panel}`}
            class={
              isContent
                ? "h-8 min-w-0 px-3 flex-row items-center gap-2 border-r border-border bg-muted group-selected:bg-background"
                : "h-8 min-w-0 px-3 flex-row items-center gap-2 bg-sidebar"
            }
            style={{ width: headerWidth(tab.panel, tab.group, isContent), maxWidth: "100%" }}
          >
            <If when={isContent}>
              <View class="absolute top-0 left-0 right-0 h-[2px] bg-transparent group-selected:bg-primary" />
            </If>
            <If when={isContent}>
              <Icon
                name={
                  tab.panel.startsWith("diff:")
                    ? "branch"
                    : tab.panel.startsWith("file:")
                      ? "file"
                      : "chat"
                }
                size={15}
              />
            </If>
            <If when={tab.panel === "files"}>
              <Button
                testID="file-root-toggle"
                accessibilityLabel="展开或收起项目目录"
                onPress={() => props.rootExpanded.set(!props.rootExpanded())}
                class="h-6 w-4 shrink-0"
              >
                <View class={props.rootExpanded() ? "rotate-90" : ""}>
                  <Icon name="chevron" size={12} />
                </View>
              </Button>
              <Icon name="folder" size={15} />
              <Text
                testID="files-header-title"
                class="flex-1 text-[13px] font-medium text-foreground"
                style={{ numberOfLines: 1 }}
              >
                {props.projectName}
              </Text>
            </If>
            <If when={tab.panel !== "files"}>
              <Text
                class={
                  isContent
                    ? "flex-1 text-[13px] text-muted-foreground group-selected:text-foreground"
                    : "text-[13px] text-foreground"
                }
                style={{ numberOfLines: 1 }}
              >
                {title(tab.panel)}
                {item()?.kind === "file" && props.dirty(tab.panel.slice(5)) ? " •" : ""}
              </Text>
              <If when={tab.panel === "conversations"}>
                <Text testID="conversations-header-count" class="text-xs text-quiet">
                  {props.conversationCount}
                </Text>
              </If>
              <If when={!isContent}>
                <View class="flex-1" />
              </If>
            </If>
            <If when={tab.panel === "files"}>
              <Button
                testID="search-files"
                accessibilityLabel="筛选已加载文件"
                onPress={props.onSearch}
                class="h-6 w-6 items-center justify-center rounded hover:bg-accent"
              >
                <Icon name="search" size={15} />
              </Button>
            </If>
            <If when={isContent && tab.panel !== "welcome"}>
              <Button
                testID={`close-content-${tab.panel}`}
                accessibilityLabel={`关闭${title(tab.panel)}`}
                onPress={() => props.onClose(tab.panel)}
                class="h-5 w-5 items-center justify-center rounded hover:bg-accent"
              >
                <Icon name="close" size={12} />
              </Button>
            </If>
            <If when={!isContent}>
              <Button
                testID={tab.panel === "conversations" ? "close-chats" : "close-sidebar"}
                accessibilityLabel="收起面板"
                onPress={() => {
                  if (tab.panel === "conversations") props.dock.chats.set(false);
                  else if (tab.panel === "files") props.dock.files.set(false);
                  else props.dock.auxiliary.set(null);
                }}
                class="h-6 w-6 items-center justify-center rounded hover:bg-accent"
              >
                <Icon name="panel" size={15} />
              </Button>
            </If>
          </View>
        );
      }}
      renderEmpty={() => (
        <View class="flex-1 items-center justify-center">
          <Text class="text-sm text-quiet">将标签拖到这里</Text>
        </View>
      )}
    />
  );
}

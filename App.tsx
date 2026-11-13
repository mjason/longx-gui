import { Image, mount, platform, Scroll, signal, Text, View, type ScrollRef } from "nsh";
import { Dialog, Input, Tab, Tabs } from "nsh/base";
import { currentWindow, titleBar } from "nsh/desktop";
import projectIcon from "./assets/project.svg";
import closeIcon from "./assets/close.svg";
import globeIcon from "./assets/globe.svg";
import layersIcon from "./assets/layers.svg";
import cloudIcon from "./assets/cloud.svg";
import compassIcon from "./assets/compass.svg";
import cubeIcon from "./assets/cube.svg";
import leafIcon from "./assets/leaf.svg";

const iconVariants = [
  { src: globeIcon, color: "#4478bc" },
  { src: layersIcon, color: "#8666ad" },
  { src: cloudIcon, color: "#42919b" },
  { src: compassIcon, color: "#bc7750" },
  { src: cubeIcon, color: "#658586" },
  { src: leafIcon, color: "#60916c" },
];

function createIcon(id: number) {
  const variant = iconOrder[(id - 1) % iconOrder.length];
  return { ...iconVariants[variant], variant };
}

// Shuffle the set once: distinct silhouettes for the first six servers.
const iconOrder = iconVariants.map((_, index) => index);
for (let index = iconOrder.length - 1; index > 0; index--) {
  const other = Math.floor(Math.random() * (index + 1));
  [iconOrder[index], iconOrder[other]] = [iconOrder[other], iconOrder[index]];
}

function App() {
  const servers = signal([
    { id: 1, name: "服务器 1", url: "", icon: createIcon(1) },
    { id: 2, name: "服务器 2", url: "", icon: createIcon(2) },
    { id: 3, name: "服务器 3", url: "", icon: createIcon(3) },
  ]);
  const selected = signal(1);
  const hovered = signal<number | null>(null);
  const projects = [1, 2, 3];
  const selectedProjects = signal<Record<number, number>>({});
  const selectedProject = () => selectedProjects()[selected()] ?? 1;
  const available = signal(1000);
  const adding = signal(false);
  const name = signal("");
  const address = signal("");
  const error = signal("");
  let nextId = 4;
  let scroll: ScrollRef | undefined;
  const tabWidth = () => Math.max(128, Math.min(220, (available() - 56) / Math.max(1, servers().length) - 10));
  const stripWidth = () => Math.max(0, Math.min(available() - 40, servers().length * (tabWidth() + 10) + 16));
  function closeServer(id: number) {
    const values = servers();
    const index = values.findIndex(server => server.id === id);
    if (index < 0) return;
    if (selected() === id) selected.set(values[index + 1]?.id ?? values[index - 1]?.id ?? 0);
    servers.set(values.filter(server => server.id !== id));
    if (hovered() === id) hovered.set(null);
    selectedProjects.update(values => {
      const remaining = { ...values };
      delete remaining[id];
      return remaining;
    });
  }
  function showSeparator(id: number) {
    const index = servers().findIndex(server => server.id === id);
    const next = servers()[index + 1]?.id;
    return selected() !== id && selected() !== next && hovered() !== id && hovered() !== next;
  }
  function addServer() {
    try {
      const url = new URL(address().trim());
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error("请填写 HTTP 或 HTTPS 服务器地址，不要包含账号、密码或查询参数。");
      }
      const normalized = url.href.replace(/\/+$/, "");
      const existing = servers().find(server => server.url === normalized);
      if (existing) selected.set(existing.id);
      else {
        const id = nextId++;
        servers.update(values => [...values, { id, name: name().trim() || url.host, url: normalized, icon: createIcon(id) }]);
        selected.set(id);
      }
      adding.set(false);
      requestAnimationFrame(() => scroll?.scrollToEnd({ animated: true }));
    } catch {
      error.set("请填写有效的 HTTP / HTTPS 地址；不要包含账号、密码、查询参数或片段。");
    }
  }
  if (["macos", "windows", "linux"].includes(platform.os)) {
    currentWindow().set({ titleBar: { style: "hidden", height: 40 } });
  }
  return <View testID="app-root" class="flex-1 bg-background">
    <View testID="top-bar" desktop={{ windowDrag: true }}
      class="h-10 flex-row items-end bg-[#d3e3fd]"
      onLayout={event => available.set(Math.max(0, event.bounds.size.width - titleBar().left - titleBar().right - 16))}
      style={{ paddingLeft: titleBar().left + 8, paddingRight: titleBar().right + 8 }}>
      <Scroll horizontal ref={value => { scroll = value; }} class="h-10 shrink-0" style={{ width: stripWidth() }}>
        <Tabs class="h-10 flex-row items-end gap-[10px] px-[10px]" style={{ overflow: "visible" }}>
          <Each of={servers()} key={server => server.id}>{server =>
            <View style={{ width: tabWidth(), overflow: "visible" }}
              onMouseEnter={() => hovered.set(server().id)}
              onMouseLeave={() => { if (hovered() === server().id) hovered.set(null); }}>
            <Tab testID={`top-tab-${server().id}`} selected={selected() === server().id} onPress={() => selected.set(server().id)}
              class={selected() === server().id ? "h-[34px] pb-[6px] px-3 flex-row items-center gap-2 bg-white" : "h-7 mb-[6px] px-3 flex-row items-center gap-2 hover:bg-[#aecbfa]"}
              style={{ width: tabWidth(), zIndex: selected() === server().id ? 2 : 0, overflow: "visible",
                borderTopLeftRadius: 10, borderTopRightRadius: 10,
                borderBottomLeftRadius: selected() === server().id ? 0 : 10, borderBottomRightRadius: selected() === server().id ? 0 : 10 }}>
              <If when={selected() === server().id}>
                <View testID={`server-selected-${server().id}`} class="absolute h-1 w-1" />
                <View class="absolute bottom-0 -left-[10px] h-[10px] w-[10px] bg-white"><View class="h-[10px] w-[10px] bg-[#d3e3fd]" style={{ borderBottomRightRadius: 10 }} /></View>
                <View class="absolute bottom-0 -right-[10px] h-[10px] w-[10px] bg-white"><View class="h-[10px] w-[10px] bg-[#d3e3fd]" style={{ borderBottomLeftRadius: 10 }} /></View>
              </If>
              <Image testID={`server-icon-${server().id}-${server().icon.variant}`} src={server().icon.src}
                class="h-4 w-4 shrink-0" style={{ tintColor: server().icon.color }} />
              <Text class="flex-1 text-[13px] text-[#34383e]" style={{ numberOfLines: 1 }}>{server().name}</Text>
              <View testID={`close-server-${server().id}`} role="button" accessibilityLabel={`关闭${server().name}`}
                desktop={{ windowDrag: false }} onPress={() => closeServer(server().id)}
                class="h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-[#00000014]">
                <Image src={closeIcon} class="h-3 w-3" style={{ tintColor: "#4b535e" }} />
              </View>
            </Tab>
            <If when={showSeparator(server().id)}>
              <View testID={`server-separator-${server().id}`} class="absolute w-[2px] h-4 bg-[#a8c7fa]"
                style={{ right: -6, top: 6 }} />
            </If>
            </View>
          }</Each>
        </Tabs>
      </Scroll>
      <View testID="add-server" role="button" accessibilityLabel="添加服务器"
        desktop={{ windowDrag: false }} class="h-7 w-7 mb-[6px] ml-1 items-center justify-center rounded-full hover:bg-[#bbd3f6]"
        onPress={() => { name.set(""); address.set(""); error.set(""); adding.set(true); }}>
        <Text class="text-xl text-[#34383e]">+</Text>
      </View>
      <View testID="titlebar-drag-region" class="flex-1 h-10" desktop={{ windowDrag: true }} />
    </View>
    <If when={servers().length > 0}>
    <View class="bg-[#d3e3fd]">
    <View testID="project-bar" class="h-11 px-3 flex-row items-center gap-3 bg-white"
      style={{ borderTopLeftRadius: 10, borderTopRightRadius: 10 }}>
      <Image src={projectIcon} class="h-4 w-4" style={{ tintColor: "#707b8e" }} />
      <Text class="text-xs text-[#707b8e]">项目</Text>
      <Scroll horizontal class="flex-1 h-8">
        <Tabs class="h-8 flex-row items-center gap-1">
          <Each of={projects}>{project =>
            <Tab testID={`project-tab-${project()}`} selected={selectedProject() === project()}
              onPress={() => selectedProjects.update(values => ({ ...values, [selected()]: project() }))}
              class={selectedProject() === project()
                ? "h-7 px-3 rounded-lg bg-[#edf2fa] flex-row items-center gap-2"
                : "h-7 px-3 rounded-lg hover:bg-[#f1f4f9] flex-row items-center gap-2"}>
              <View class="h-1 w-1"><If when={selectedProject() === project()}><View testID={`project-selected-${project()}`} class="h-1 w-1 rounded-full bg-[#4779c4]" /></If></View>
              <Text class="text-[13px] text-[#45536a]">项目 {project()}</Text>
            </Tab>
          }</Each>
        </Tabs>
      </Scroll>
    </View>
    </View>
    </If>
    <View testID="empty-content" class="flex-1 bg-white" />
    <If when={adding()}>
      <Dialog accessibilityLabel="添加服务器" animation="fade" onOpenChange={event => { if (!event.open) adding.set(false); }}
        class="w-[420px] self-center mt-20 p-5 gap-3 rounded-xl border border-[#dfe2e8] bg-white shadow-lg" backdropClass="bg-black/20">
        <Text class="text-base text-[#34383e]">添加服务器</Text>
        <Input testID="server-name" value={name()} onChange={event => name.set(event.value)} placeholder="显示名称（可选）"
          class="h-9 px-3 rounded-lg border border-[#dfe2e8] text-sm text-[#34383e]" />
        <Input testID="server-address" autoFocus value={address()} onChange={event => address.set(event.value)} onSubmit={addServer}
          placeholder="https://example.com" class="h-9 px-3 rounded-lg border border-[#dfe2e8] text-sm text-[#34383e]" />
        <Text class="text-xs text-[#707785]">目前只添加当前窗口的服务器页签，不发起网络连接。</Text>
        <If when={!!error()}><Text class="text-xs text-red-600">{error()}</Text></If>
        <View class="flex-row justify-end gap-3">
          <View role="button" class="h-8 px-3 justify-center" onPress={() => adding.set(false)}><Text class="text-sm text-[#34383e]">取消</Text></View>
          <View testID="confirm-add-server" role="button" class="h-8 px-3 justify-center rounded-lg bg-[#d3e3fd]" onPress={addServer}><Text class="text-sm text-[#244b88]">添加</Text></View>
        </View>
      </Dialog>
    </If>
  </View>;
}

mount(App);

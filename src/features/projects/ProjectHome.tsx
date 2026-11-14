import { signal, Text, View } from "nsh";
import { Input } from "nsh/base";
import { AppButton as Button } from "../../components/AppButton";
import { Icon } from "../../components/Icon";
import type { WorkspaceState } from "../../state/workspace";

export function ProjectHome(props: {
  workspace: WorkspaceState;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDirectory: () => void;
  onSettings: (id: string) => void;
  onGlobalSettings: () => void;
}) {
  const search = signal("");
  const projects = () =>
    props.workspace
      .projects()
      .filter((project) =>
        `${project.name} ${project.slug} ${project.rootPath}`
          .toLowerCase()
          .includes(search().trim().toLowerCase()),
      )
      .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  return (
    <View testID="project-home" class="gap-5">
      <View class="flex-row flex-wrap items-center gap-3">
        <View class="flex-1 min-w-[160px] gap-1">
          <Text class="text-xl font-semibold text-foreground">项目</Text>
          <Text class="text-xs text-muted-foreground">
            {props.workspace.currentServer()?.name || "未连接服务器"} · 选择一个工作目录开始
          </Text>
        </View>
        <Button
          testID="home-global-settings"
          class="h-8 px-3 rounded hover:bg-accent"
          onPress={props.onGlobalSettings}
        >
          <Text class="text-sm text-muted-foreground">全局设置</Text>
        </Button>
      </View>
      <View class="flex-row flex-wrap items-center gap-2">
        <Button
          testID="new-project"
          class="h-9 px-4 gap-2 rounded bg-accent"
          disabled={props.workspace.connection()?.status !== "ready"}
          onPress={props.onCreate}
        >
          <Icon name="plus" size={16} />
          <Text class="text-sm text-primary">新建项目</Text>
        </Button>
        <Button
          testID="open-project-directory"
          class="h-9 px-4 gap-2 rounded border border-border hover:bg-accent"
          disabled={props.workspace.connection()?.status !== "ready"}
          onPress={props.onDirectory}
        >
          <Icon name="folder" size={16} />
          <Text class="text-sm text-foreground">打开其他项目…</Text>
        </Button>
      </View>
      <Input
        testID="home-project-search"
        accessibilityLabel="搜索项目"
        value={search()}
        onChange={({ value }) => search.set(value)}
        placeholder="搜索项目名称或路径…"
        class="h-9 px-3 rounded border border-border text-sm text-foreground"
      />
      <If when={props.workspace.connection()?.status === "ready" && !projects().length}>
        <Text class="text-sm text-muted-foreground">
          {search() ? "没有匹配的项目" : "还没有项目，新建或打开一个目录开始使用。"}
        </Text>
      </If>
      <Each of={projects()} key={(project) => project.id}>
        {(project) => (
          <View class="px-4 py-3 gap-2 rounded-lg border border-border bg-surface">
            <View class="flex-row items-center gap-2">
              <Icon name="folder" size={18} />
              <Text class="flex-1 text-sm font-medium text-foreground" style={{ numberOfLines: 1 }}>
                {project().name}
              </Text>
              <If when={project().pinned}>
                <Text class="text-xs text-primary">已置顶</Text>
              </If>
              <If when={props.workspace.selectedProject()?.id === project().id}>
                <Text class="text-xs text-quiet">当前项目</Text>
              </If>
            </View>
            <Text class="text-xs text-muted-foreground" style={{ numberOfLines: 2 }}>
              {project().rootPath}
            </Text>
            <View class="flex-row items-center gap-2">
              <Button
                testID={`home-open-${project().id}`}
                class="h-8 px-3 rounded bg-accent"
                onPress={() => props.onOpen(project().id)}
              >
                <Text class="text-sm text-primary">打开项目</Text>
              </Button>
              <Button
                testID={`home-project-settings-${project().id}`}
                class="h-8 px-3 rounded hover:bg-accent"
                onPress={() => props.onSettings(project().id)}
              >
                <Text class="text-sm text-muted-foreground">项目设置</Text>
              </Button>
            </View>
          </View>
        )}
      </Each>
    </View>
  );
}

import { effect, keymap, mount, platform, type ScrollRef, signal, Text, View } from "nsh";
import { currentWindow } from "nsh/desktop";
import type { Project } from "./src/api/client";
import { AppButton as Button } from "./src/components/AppButton";
import {
  type ProjectConnection,
  ProjectDirectoryDialog,
} from "./src/features/projects/ProjectDirectoryDialog";
import { ProjectHome } from "./src/features/projects/ProjectHome";
import { ProjectQuickSwitch } from "./src/features/projects/ProjectQuickSwitch";
import { ProjectSettingsDialog } from "./src/features/projects/ProjectSettingsDialog";
import { ProjectSwitcher } from "./src/features/projects/ProjectSwitcher";
import { AddServerDialog } from "./src/features/servers/AddServerDialog";
import { ServerTabBar } from "./src/features/servers/ServerTabBar";
import { installApplicationMenu } from "./src/features/settings/applicationMenu";
import { createEditorSettings } from "./src/features/settings/editorSettings";
import { SettingsDialog } from "./src/features/settings/SettingsDialog";
import { invalidateComposerCatalog } from "./src/features/threads/ComposerModels";
import { appUpdates } from "./src/features/updates/updates";
import { WorkspaceLayout } from "./src/features/workspace/WorkspaceLayout";
import { createWorkspaceState } from "./src/state/workspace";
import { createThemeState } from "./src/theme/themes";

function App() {
  const theme = createThemeState();
  const workspace = createWorkspaceState();
  const adding = signal(false);
  const settingsOpen = signal(false);
  const settingsSection = signal<"local" | "updates">("local");
  effect(() => appUpdates.start());
  const settings = createEditorSettings();
  const quickSwitch = signal(false);
  const navigation = signal<{ kind: "home" | "open"; version: number } | undefined>(undefined);
  const directoryTarget = signal<{ connection: ProjectConnection; mode: "new" | "open" } | null>(
    null,
  );
  const projectSettings = signal<{ connection: ProjectConnection; project: Project } | null>(null);
  const settingsConnection = signal<ProjectConnection | null>(null);
  const projectBusy = signal(false);
  let navigationVersion = 0;
  let scroll: ScrollRef | undefined;
  function connection(): ProjectConnection | null {
    const server = workspace.currentServer();
    return server ? { serverId: server.id, url: server.url, name: server.name } : null;
  }
  function current(target: ProjectConnection) {
    return (
      workspace.currentServer()?.id === target.serverId &&
      workspace.currentServer()?.url === target.url
    );
  }
  function openSettings() {
    if (projectBusy() || directoryTarget() || projectSettings() || quickSwitch()) return;
    adding.set(false);
    settingsSection.set("local");
    settingsConnection.set(connection());
    settingsOpen.set(true);
  }
  function openUpdates() {
    if (projectBusy() || directoryTarget() || projectSettings() || quickSwitch()) return;
    openSettings();
    settingsSection.set("updates");
    void appUpdates.check();
  }
  function chooseProject(id: string) {
    workspace.selectProject(id);
    quickSwitch.set(false);
    navigation.set({ kind: "open", version: ++navigationVersion });
  }
  function openProjectSettings(id: string) {
    const project = workspace.projects().find((project) => project.id === id),
      target = connection();
    if (project && target) projectSettings.set({ connection: target, project });
  }
  function openDirectory(mode: "new" | "open") {
    const target = connection();
    if (target) directoryTarget.set({ connection: target, mode });
  }
  keymap.bind("mod+shift+p", () => {
    if (workspace.projects().length && !settingsOpen() && !directoryTarget() && !projectSettings())
      quickSwitch.set(!quickSwitch());
  });

  if (["macos", "windows", "linux"].includes(platform.os)) {
    currentWindow().set({ titleBar: { style: "hidden", height: 40 } });
    installApplicationMenu(openSettings, openUpdates);
  }

  return (
    <View testID="app-root" class="flex-1 bg-background font-sans">
      <ServerTabBar
        servers={workspace.servers}
        selected={workspace.selectedServer}
        onSelect={workspace.selectServer}
        onClose={workspace.closeServer}
        onAdd={() => adding.set(true)}
        scrollRef={(value) => {
          scroll = value;
        }}
      />
      <If when={appUpdates.phase() === "available" || appUpdates.phase() === "ready"}>
        <View testID="update-banner" class="px-4 py-2 flex-row items-center gap-3 bg-accent">
          <Text class="flex-1 text-xs text-foreground">
            {`Longx GUI ${appUpdates.candidate()?.value.version} ${appUpdates.phase() === "ready" ? "已就绪，可稍后重启应用" : "可更新"}`}
          </Text>
          <Button class="h-7 px-3 rounded hover:bg-background" onPress={openUpdates}>
            <Text class="text-xs text-primary">查看更新</Text>
          </Button>
        </View>
      </If>
      <If when={workspace.servers().length > 0}>
        <ProjectSwitcher
          projects={workspace.projects}
          selected={() => workspace.selectedProject()?.id}
          onSelect={chooseProject}
          onHome={() => navigation.set({ kind: "home", version: ++navigationVersion })}
          onQuickSwitch={() => quickSwitch.set(true)}
          status={() =>
            workspace.connection()?.status === "loading"
              ? "正在读取项目…"
              : workspace.connection()?.status === "error"
                ? "连接失败"
                : "暂无项目"
          }
          onRefresh={workspace.refresh}
        />
      </If>
      <WorkspaceLayout
        workspace={workspace}
        theme={theme}
        settings={settings}
        onSettings={openSettings}
        projectNavigation={navigation()}
        externalBusy={projectBusy()}
        onProjectSettings={() => {
          const id = workspace.selectedProject()?.id;
          if (id) openProjectSettings(id);
        }}
        projectHome={() => (
          <ProjectHome
            workspace={workspace}
            onOpen={chooseProject}
            onCreate={() => openDirectory("new")}
            onDirectory={() => openDirectory("open")}
            onSettings={openProjectSettings}
            onGlobalSettings={openSettings}
          />
        )}
      />
      <If when={settingsOpen()}>
        <SettingsDialog
          settings={settings}
          initialSection={settingsSection()}
          theme={theme}
          connection={settingsConnection()}
          isCurrentServer={() => !!settingsConnection() && current(settingsConnection()!)}
          onServerSaved={invalidateComposerCatalog}
          onBusy={projectBusy.set}
          onClose={() => settingsOpen.set(false)}
        />
      </If>
      <If when={quickSwitch()}>
        <ProjectQuickSwitch
          projects={workspace.projects()}
          selected={workspace.selectedProject()?.id}
          onSelect={chooseProject}
          onClose={() => quickSwitch.set(false)}
        />
      </If>
      <If when={!!directoryTarget()}>
        <ProjectDirectoryDialog
          connection={directoryTarget()!.connection}
          mode={directoryTarget()!.mode}
          projects={workspace.projects()}
          isCurrent={() => !!directoryTarget() && current(directoryTarget()!.connection)}
          onBusy={projectBusy.set}
          onClose={() => directoryTarget.set(null)}
          onCreated={(project) => {
            const target = directoryTarget();
            if (!target) return;
            workspace.applyProject(
              target.connection.serverId,
              target.connection.url,
              project,
              current(target.connection),
            );
            directoryTarget.set(null);
            if (current(target.connection)) chooseProject(project.id);
          }}
        />
      </If>
      <If when={!!projectSettings()}>
        <ProjectSettingsDialog
          connection={projectSettings()!.connection}
          project={projectSettings()!.project}
          isCurrent={() => !!projectSettings() && current(projectSettings()!.connection)}
          onBusy={projectBusy.set}
          onClose={() => projectSettings.set(null)}
          onSaved={(project) => {
            const target = projectSettings();
            if (target)
              workspace.applyProject(target.connection.serverId, target.connection.url, project);
            invalidateComposerCatalog();
          }}
        />
      </If>
      <If when={adding()}>
        <AddServerDialog
          onClose={() => adding.set(false)}
          onAdd={(name, address) => {
            workspace.addServer(name, address);
            requestAnimationFrame(() => scroll?.scrollToEnd({ animated: true }));
          }}
        />
      </If>
    </View>
  );
}

mount(App);

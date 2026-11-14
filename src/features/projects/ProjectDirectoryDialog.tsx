import { effect, Scroll, signal, Text, untracked, View } from "nsh";
import { Dialog, Input, Switch } from "nsh/base";
import type { Project } from "../../api/client";
import {
  createDirectory,
  createProject,
  directory,
  type ProjectDetails,
  type ServerDirectory,
} from "../../api/projects";
import { OperationError } from "../../api/session";
import { AppButton as Button } from "../../components/AppButton";
import { Icon } from "../../components/Icon";

export interface ProjectConnection {
  serverId: number;
  url: string;
  name: string;
}
export function ProjectDirectoryDialog(props: {
  connection: ProjectConnection;
  mode: "new" | "open";
  projects: Project[];
  isCurrent: () => boolean;
  onCreated: (project: ProjectDetails | Project) => void;
  onClose: () => void;
  onBusy?: (busy: boolean) => void;
}) {
  const knownProjects = [...props.projects];
  const requested = signal<string | undefined>(undefined),
    data = signal<ServerDirectory | null>(null),
    address = signal(""),
    name = signal(""),
    folder = signal(""),
    hidden = signal(false),
    initGit = signal(false),
    loading = signal(true),
    busy = signal(false),
    error = signal(""),
    uncertain = signal(false),
    createdPath = signal("");
  let nameEdited = false;
  const reload = signal(0);
  effect(() => {
    const path = requested(),
      showHidden = hidden();
    reload();
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 15000);
    let active = true;
    loading.set(true);
    error.set("");
    void directory(props.connection.url, path, showHidden, controller.signal)
      .then((value) => {
        if (!active) return;
        data.set(value);
        address.set(value.path);
        if (!nameEdited && props.mode === "open")
          name.set(value.path.split(/[\\/]/).filter(Boolean).at(-1) || "项目");
      })
      .catch((failure) => {
        if (active) {
          data.set(null);
          error.set(failure instanceof Error ? failure.message : "目录读取失败。");
        }
      })
      .finally(() => {
        clearTimeout(timeout);
        if (active) loading.set(false);
      });
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
    };
  });
  const canNavigate = () => !busy() && !createdPath() && !uncertain();
  function navigate(path: string) {
    if (!canNavigate()) return;
    if (requested() === path) reload.set(reload() + 1);
    else requested.set(path);
  }
  async function submit() {
    if (busy() || uncertain() || loading() || !data() || !name().trim()) return;
    if (!props.isCurrent()) {
      error.set("服务器已切换，请关闭后在目标服务器重新操作。");
      return;
    }
    busy.set(true);
    props.onBusy?.(true);
    error.set("");
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 30000);
    try {
      let rootPath = createdPath() || data()!.path;
      if (props.mode === "new" && !createdPath()) {
        const basename = folder().trim();
        if (!basename || basename === "." || basename === ".." || /[/\\\0]/.test(basename))
          throw new Error("请输入单个有效的新目录名称。");
        if (data()!.entries.some((entry) => entry.name === basename))
          throw new Error("该目录已存在。要使用现有目录，请选择“打开其他项目”。");
        const result = await createDirectory(
          props.connection.url,
          data()!.path,
          basename,
          controller.signal,
        );
        createdPath.set(result.path);
        rootPath = result.path;
      }
      const existing = knownProjects.find(
        (project) => project.rootPath.replace(/[/\\]+$/, "") === rootPath.replace(/[/\\]+$/, ""),
      );
      if (existing) props.onCreated(existing);
      else {
        if (!props.isCurrent()) throw new Error("服务器已切换，未注册项目。已创建的目录会保留。");
        const project = await createProject(
          props.connection.url,
          {
            name: name().trim(),
            rootPath,
            initGit: initGit() && (props.mode === "new" || !data()!.git),
          },
          controller.signal,
        );
        props.onCreated(project);
      }
    } catch (failure) {
      error.set(failure instanceof Error ? failure.message : "项目操作失败。");
      uncertain.set(failure instanceof OperationError && !failure.rejected);
    } finally {
      busy.set(false);
      props.onBusy?.(false);
      clearTimeout(timeout);
    }
  }
  return (
    <Dialog
      testID="project-directory-dialog"
      open={true}
      accessibilityLabel={props.mode === "new" ? "新建项目" : "打开其他项目"}
      onOpenChange={({ open }) => {
        if (!open && !busy()) props.onClose();
      }}
      class="w-[680px] h-[700px] max-w-[94%] max-h-[90%] m-auto rounded-xl border border-border bg-background shadow-lg"
      backdropClass="bg-overlay/20"
    >
      <View class="px-5 py-4 border-b border-border gap-1">
        <Text class="text-lg text-foreground">
          {props.mode === "new" ? "新建项目" : "打开其他项目"}
        </Text>
        <Text class="text-xs text-muted-foreground">
          {props.connection.name} · 这是服务器上的目录，不是本机文件选择器
        </Text>
      </View>
      <Scroll testID="project-directory-body" class="flex-1">
        <View class="p-5 gap-3">
          <Text class="text-xs text-quiet">
            {props.mode === "new" ? "选择新项目的父目录" : "选择已有项目目录"}
          </Text>
          <View class="flex-row items-center gap-2">
            <Input
              testID="server-directory-path"
              accessibilityLabel="服务器目录路径"
              value={address()}
              onChange={({ value }) => address.set(value)}
              onSubmit={() => navigate(address().trim())}
              class="flex-1 h-9 px-3 rounded border border-border text-sm text-foreground"
            />
            <Button
              testID="server-directory-go"
              class="h-9 px-3 rounded bg-accent"
              disabled={!canNavigate() || !address().trim()}
              onPress={() => navigate(address().trim())}
            >
              <Text class="text-sm text-primary">前往</Text>
            </Button>
          </View>
          <View class="flex-row flex-wrap items-center gap-2">
            <Each of={data()?.roots ?? []} key={(entry) => entry.path}>
              {(entry) => (
                <Button
                  class="h-7 px-2 rounded hover:bg-accent"
                  disabled={!canNavigate()}
                  onPress={() => navigate(entry().path)}
                >
                  <Text class="text-xs text-muted-foreground">{entry().name || entry().path}</Text>
                </Button>
              )}
            </Each>
            <Button
              testID="directory-parent"
              class="h-7 px-2 rounded hover:bg-accent"
              disabled={!canNavigate() || data()?.parent == null}
              onPress={() => {
                if (data()?.parent != null) navigate(data()!.parent!);
              }}
            >
              <Text class="text-xs text-foreground">上一级</Text>
            </Button>
            <View class="flex-1" />
            <Text class="text-xs text-muted-foreground">隐藏目录</Text>
            <Switch
              testID="directory-hidden"
              accessibilityLabel="显示隐藏目录"
              checked={hidden()}
              disabled={!canNavigate()}
              onChange={({ checked }) => hidden.set(checked)}
              class="flex-row items-center"
              trackClass="w-9 p-0.5 rounded-full bg-border checked:bg-primary"
              thumbClass="size-4 rounded-full bg-background checked:translate-x-4"
            />
          </View>
          <If when={loading()}>
            <Text class="text-sm text-quiet">正在读取目录…</Text>
          </If>
          <If when={!loading()}>
            <View class="border border-border rounded gap-1 p-1">
              <Each of={data()?.entries ?? []} key={(entry) => entry.path}>
                {(entry) => (
                  <Button
                    testID={`server-directory-${entry().name}`}
                    class="h-8 px-3 gap-2 rounded hover:bg-accent"
                    disabled={!canNavigate()}
                    onPress={() => navigate(entry().path)}
                  >
                    <Icon name="folder" size={16} />
                    <Text class="flex-1 text-sm text-foreground" style={{ numberOfLines: 1 }}>
                      {entry().name}
                    </Text>
                    <If when={entry().git}>
                      <Text class="text-xs text-primary">Git</Text>
                    </If>
                    <Icon name="chevron" size={12} />
                  </Button>
                )}
              </Each>
              <If when={!!data() && !data()!.entries.length}>
                <Text class="p-3 text-sm text-quiet">没有子目录，可直接使用此目录。</Text>
              </If>
              <If when={!data()}>
                <Button
                  class="h-8 px-3 rounded hover:bg-accent"
                  onPress={() => reload.set(reload() + 1)}
                >
                  <Text class="text-sm text-primary">重新读取</Text>
                </Button>
              </If>
            </View>
          </If>
          <Text class="text-xs text-quiet">项目名称</Text>
          <Input
            testID="project-name"
            accessibilityLabel="项目名称"
            value={name()}
            onChange={({ value }) => {
              nameEdited = true;
              name.set(value);
            }}
            class="h-9 px-3 rounded border border-border text-sm text-foreground"
          />
          <If when={props.mode === "new"}>
            <Text class="text-xs text-quiet">新目录名称</Text>
            <Input
              testID="project-folder-name"
              accessibilityLabel="新目录名称"
              value={folder()}
              onChange={({ value }) => folder.set(value)}
              class="h-9 px-3 rounded border border-border text-sm text-foreground"
            />
          </If>
          <View class="flex-row items-center gap-3">
            <Text class="flex-1 text-sm text-foreground">初始化 Git 仓库</Text>
            <Switch
              testID="project-init-git"
              accessibilityLabel="初始化 Git 仓库"
              checked={initGit()}
              onChange={({ checked }) => initGit.set(checked)}
              disabled={busy() || (props.mode === "open" && !!data()?.git)}
              class="flex-row items-center"
              trackClass="w-10 p-0.5 rounded-full bg-border checked:bg-primary"
              thumbClass="size-4 rounded-full bg-background checked:translate-x-5"
            />
          </View>
          <If when={!!createdPath()}>
            <Text class="text-xs text-ochre">
              已创建目录：{createdPath()}。关闭不会删除此目录；注册失败后重试只会注册项目。
            </Text>
          </If>
          <If when={!!error()}>
            <Text testID="project-directory-error" class="text-sm text-destructive">
              {error()}
            </Text>
          </If>
          <If when={uncertain()}>
            <Text class="text-xs text-muted-foreground">
              结果不明，已禁止重复提交。请关闭并刷新项目／目录核对。
            </Text>
          </If>
        </View>
      </Scroll>
      <View class="px-5 py-3 border-t border-border flex-row justify-end gap-2">
        <Button
          testID="project-directory-cancel"
          class="h-8 px-3 rounded hover:bg-accent"
          disabled={busy()}
          onPress={props.onClose}
        >
          <Text class="text-sm text-muted-foreground">取消</Text>
        </Button>
        <Button
          testID="project-directory-confirm"
          class="h-8 px-4 rounded bg-accent disabled:opacity-50"
          disabled={
            busy() ||
            uncertain() ||
            loading() ||
            !data() ||
            !name().trim() ||
            (props.mode === "new" && !folder().trim())
          }
          onPress={() => void untracked(submit)}
        >
          <Text class="text-sm text-primary">
            {busy() ? "正在处理…" : props.mode === "new" ? "创建项目" : "打开项目"}
          </Text>
        </Button>
      </View>
    </Dialog>
  );
}

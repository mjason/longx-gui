import { effect, Scroll, signal, Text, View } from "nsh";
import { AlertDialog, Dialog, Input, Select, Switch } from "nsh/base";
import type { Project } from "../../api/client";
import { type SettingsModel, settingsModels } from "../../api/preferences";
import {
  getProject,
  type ProjectDetails,
  type ProjectUpdate,
  updateProject,
} from "../../api/projects";
import { OperationError } from "../../api/session";
import { AppButton as Button } from "../../components/AppButton";
import { Icon } from "../../components/Icon";
import type { ProjectConnection } from "./ProjectDirectoryDialog";

export function ProjectSettingsDialog(props: {
  connection: ProjectConnection;
  project: Project;
  isCurrent: () => boolean;
  onSaved: (project: ProjectDetails) => void;
  onClose: () => void;
  onBusy?: (busy: boolean) => void;
}) {
  const baseline = signal<ProjectDetails | null>(null),
    draft = signal<ProjectUpdate | null>(null),
    models = signal<SettingsModel[]>([]),
    loading = signal(true),
    busy = signal(false),
    uncertain = signal(false),
    error = signal(""),
    notice = signal(""),
    retry = signal(0);
  effect(() => {
    retry();
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 15000);
    let active = true;
    loading.set(true);
    error.set("");
    void Promise.all([
      getProject(props.connection.url, props.project.slug, controller.signal),
      settingsModels(props.connection.url, controller.signal),
    ])
      .then(([project, catalog]) => {
        if (!active) return;
        if (project.id !== props.project.id) throw new Error("项目响应不匹配。");
        baseline.set(project);
        draft.set({
          name: project.name,
          description: project.description || "",
          modelId: project.modelId,
          pinned: project.pinned,
          webSearch: project.webSearch,
          trustLocalAgent: project.trustLocalAgent,
        });
        models.set(catalog);
        uncertain.set(false);
      })
      .catch((failure) => {
        if (active) error.set(failure instanceof Error ? failure.message : "无法读取项目设置。");
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
  function edit<K extends keyof ProjectUpdate>(key: K, value: ProjectUpdate[K]) {
    if (!draft() || busy() || uncertain()) return;
    draft.update((previous) => ({ ...previous!, [key]: value }));
    notice.set("");
  }
  const changes = () => {
    const value = draft(),
      original = baseline();
    if (!value || !original) return {};
    const result: Partial<ProjectUpdate> = {};
    for (const key of Object.keys(value) as (keyof ProjectUpdate)[]) {
      const next =
        key === "name"
          ? value.name.trim()
          : key === "description"
            ? value.description?.trim() || null
            : value[key];
      if (next !== original[key]) Object.assign(result, { [key]: next });
    }
    return result;
  };
  async function save() {
    if (busy() || loading() || uncertain() || !draft()?.name.trim()) return;
    if (!props.isCurrent()) {
      error.set("工作区已切换，请关闭后在目标项目中重新打开设置。");
      return;
    }
    const input = changes();
    if (!Object.keys(input).length) return;
    busy.set(true);
    props.onBusy?.(true);
    error.set("");
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (input.trustLocalAgent === true && !baseline()?.trustLocalAgent) {
        const answer = await AlertDialog.show({
          title: "信任项目定义？",
          description: `将允许服务器加载 ${props.project.rootPath} 中 .longx 的项目定义和代码。只应信任你审查过的项目。`,
          closeOnEscape: true,
          actions: [
            { id: "cancel", label: "取消", role: "cancel" },
            { id: "trust", label: "信任并保存" },
          ],
        });
        if (answer.action !== "trust") return;
      }
      if (!props.isCurrent()) throw new Error("工作区已切换，未保存。");
      timeout = setTimeout(() => controller.abort(), 30000);
      const result = await updateProject(
        props.connection.url,
        props.project.id,
        input,
        controller.signal,
      );
      baseline.set(result);
      notice.set("已保存到服务器");
      props.onSaved(result);
    } catch (failure) {
      error.set(failure instanceof Error ? failure.message : "项目设置保存失败。");
      uncertain.set(failure instanceof OperationError && !failure.rejected);
    } finally {
      busy.set(false);
      props.onBusy?.(false);
      clearTimeout(timeout);
    }
  }
  const field = "h-9 px-3 rounded border border-border text-sm text-foreground";
  const toggles = [
    { key: "pinned", title: "置顶项目", hint: "在项目主页和快速切换列表中优先显示。" },
    { key: "webSearch", title: "允许网页搜索", hint: "设置此项目的网页搜索默认值。" },
    {
      key: "trustLocalAgent",
      title: "信任 .longx 项目定义",
      hint: "允许加载项目携带的定义和代码。启用前需要再次确认。",
    },
  ] as const;
  return (
    <Dialog
      testID="project-settings-dialog"
      open={true}
      accessibilityLabel="项目设置"
      onOpenChange={({ open }) => {
        if (!open && !busy()) props.onClose();
      }}
      class="w-[640px] h-[700px] max-w-[94%] max-h-[90%] m-auto rounded-xl border border-border bg-background shadow-lg"
      backdropClass="bg-overlay/20"
    >
      <View class="px-5 py-4 gap-1 border-b border-border">
        <Text class="text-lg text-foreground">
          项目设置 · {baseline()?.name || props.project.name}
        </Text>
        <Text class="text-xs text-muted-foreground">{props.connection.name} · 仅作用于此项目</Text>
      </View>
      <Scroll testID="project-settings-body" class="flex-1">
        <View class="p-5 gap-3">
          <Text class="text-xs text-quiet">目录（不可在此更改）</Text>
          <Text class="text-sm text-muted-foreground" style={{ numberOfLines: 3 }}>
            {props.project.rootPath}
          </Text>
          <If when={loading()}>
            <Text class="text-sm text-quiet">正在读取项目设置…</Text>
          </If>
          <If when={!!draft()}>
            <Text class="text-xs text-quiet">项目名称</Text>
            <Input
              testID="project-settings-name"
              accessibilityLabel="项目名称"
              class={field}
              value={draft()!.name}
              onChange={({ value }) => edit("name", value)}
            />
            <Text class="text-xs text-quiet">描述</Text>
            <Input
              testID="project-settings-description"
              accessibilityLabel="项目描述"
              multiline
              class="h-20 px-3 py-2 rounded border border-border text-sm text-foreground"
              value={draft()!.description || ""}
              onChange={({ value }) => edit("description", value)}
            />
            <Text class="text-xs text-quiet">默认模型（会话显式选择优先）</Text>
            <Select
              accessibilityLabel="项目默认模型"
              searchable
              value={draft()!.modelId || "__default"}
              items={[
                { value: "__default", title: "跟随服务器全局默认", group: "默认" },
                ...(draft()!.modelId && !models().some((model) => model.id === draft()!.modelId)
                  ? [{ value: draft()!.modelId!, title: "当前模型（目录中不可用）", group: "当前" }]
                  : []),
                ...models().map((model) => ({
                  value: model.id,
                  title: `${model.slug} · ${model.name}`,
                  group: model.provider.name,
                })),
              ]}
              onChange={({ value }) => edit("modelId", value === "__default" ? null : value)}
              popupClass="w-[360px] max-h-[320px] rounded-lg p-1 border border-border bg-popover shadow-lg"
              itemClass="px-3 py-2 rounded focus:bg-accent selected:bg-accent text-sm text-foreground"
              groupClass="px-3 py-2 text-xs text-quiet"
              searchClass="h-8 px-3 text-sm text-foreground"
              searchPlaceholder="搜索模型"
              trigger={
                <View
                  testID="project-settings-model"
                  class="h-9 px-3 flex-row items-center gap-2 rounded border border-border"
                >
                  <Text
                    class="flex-1 h-5 text-sm text-foreground"
                    style={{ numberOfLines: 1, lineHeight: 18, textAlignVertical: "center" }}
                  >
                    {models().find((model) => model.id === draft()!.modelId)?.slug ||
                      (draft()!.modelId ? "当前模型（不可用）" : "跟随服务器全局默认")}
                  </Text>
                  <Icon name="chevronDown" size={12} />
                </View>
              }
            />
            <Each of={toggles}>
              {(item) => (
                <View class="py-2 flex-row items-center gap-4">
                  <View class="flex-1 gap-1">
                    <Text class="text-sm text-foreground">{item().title}</Text>
                    <Text class="text-xs text-muted-foreground">{item().hint}</Text>
                  </View>
                  <Switch
                    testID={`project-setting-${item().key}`}
                    accessibilityLabel={item().title}
                    checked={draft()![item().key]}
                    disabled={busy() || uncertain()}
                    onChange={({ checked }) => edit(item().key, checked)}
                    class="flex-row items-center"
                    trackClass="w-10 p-0.5 rounded-full bg-border checked:bg-primary"
                    thumbClass="size-4 rounded-full bg-background checked:translate-x-5"
                  />
                </View>
              )}
            </Each>
          </If>
          <If when={!!error()}>
            <Text testID="project-settings-error" class="text-sm text-destructive">
              {error()}
            </Text>
          </If>
          <If when={uncertain()}>
            <Text class="text-xs text-muted-foreground">
              保存结果不明，已阻止重复保存。请关闭后重新读取核对。
            </Text>
          </If>
          <If when={!draft() && !loading()}>
            <Button class="h-8 px-3 rounded bg-accent" onPress={() => retry.set(retry() + 1)}>
              <Text class="text-sm text-primary">重试读取</Text>
            </Button>
          </If>
        </View>
      </Scroll>
      <View class="px-5 py-3 flex-row items-center gap-2 border-t border-border">
        <Text class="flex-1 text-xs text-muted-foreground">
          {notice() || (Object.keys(changes()).length ? "有未保存设置" : "只会保存修改过的字段")}
        </Text>
        <Button
          testID="project-settings-close"
          class="h-8 px-3 rounded hover:bg-accent"
          disabled={busy()}
          onPress={props.onClose}
        >
          <Text class="text-sm text-muted-foreground">完成</Text>
        </Button>
        <Button
          testID="project-settings-save"
          class="h-8 px-3 rounded bg-accent disabled:opacity-50"
          disabled={
            busy() ||
            loading() ||
            uncertain() ||
            !draft()?.name.trim() ||
            !Object.keys(changes()).length
          }
          onPress={() => void save()}
        >
          <Text class="text-sm text-primary">{busy() ? "保存中…" : "保存设置"}</Text>
        </Button>
      </View>
    </Dialog>
  );
}

import { effect, signal, Text, View } from "nsh";
import { Input, Select } from "nsh/base";
import {
  type RuntimeSettings,
  type ServerPreferences,
  saveDefaultModel,
  saveRuntime,
  serverPreferences,
} from "../../api/preferences";
import { OperationError } from "../../api/session";
import { AppButton as Button } from "../../components/AppButton";
import { Icon } from "../../components/Icon";
import type { ProjectConnection } from "../projects/ProjectDirectoryDialog";

const runtimeFields = [
  { key: "modelRetries", title: "模型重试次数" },
  { key: "maxDepth", title: "子代理最大层级" },
  { key: "maxChildren", title: "子代理数量上限" },
  { key: "idleMinutes", title: "空闲时间（分钟）" },
] as const;
export function ServerSettings(props: {
  connection: ProjectConnection;
  isCurrent: () => boolean;
  onBusy: (busy: boolean) => void;
  onSaved?: () => void;
}) {
  const data = signal<ServerPreferences | null>(null),
    selected = signal(""),
    values = signal<Record<keyof RuntimeSettings, string>>({
      modelRetries: "",
      maxDepth: "",
      maxChildren: "",
      idleMinutes: "",
    }),
    busy = signal(false),
    loading = signal(true),
    uncertain = signal(false),
    error = signal(""),
    notice = signal(""),
    retry = signal(0);
  effect(() => {
    retry();
    let active = true;
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 15000);
    loading.set(true);
    error.set("");
    void serverPreferences(props.connection.url, controller.signal)
      .then((value) => {
        if (!active) return;
        data.set(value);
        selected.set(value.defaultModelSetting.name);
        values.set(
          Object.fromEntries(
            runtimeFields.map(({ key }) => [key, String(value.agentSettings[key])]),
          ) as Record<keyof RuntimeSettings, string>,
        );
        uncertain.set(false);
      })
      .catch((failure) => {
        if (active) error.set(failure instanceof Error ? failure.message : "读取全局设置失败。");
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
  async function save(section: "model" | "runtime") {
    if (busy() || uncertain() || !data()) return;
    if (!props.isCurrent()) {
      error.set("当前服务器已切换，请重新打开全局设置。");
      return;
    }
    const input: Partial<RuntimeSettings> = {};
    if (section === "runtime") {
      for (const { key } of runtimeFields) {
        const value = Number(values()[key]);
        if (
          !values()[key].trim() ||
          !Number.isSafeInteger(value) ||
          value < 0 ||
          value > 2147483647
        ) {
          error.set("运行参数需为非负整数，且不超过 2147483647。");
          return;
        }
        if (value !== data()!.agentSettings[key]) input[key] = value;
      }
      if (!Object.keys(input).length) return;
    }
    busy.set(true);
    props.onBusy(true);
    error.set("");
    notice.set("");
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 15000);
    try {
      if (section === "model") {
        await saveDefaultModel(props.connection.url, selected(), controller.signal);
        data.update((previous) => ({
          ...previous!,
          defaultModelSetting: { ...previous!.defaultModelSetting, name: selected() },
        }));
      } else {
        const settings = await saveRuntime(props.connection.url, input, controller.signal);
        data.update((previous) => ({ ...previous!, agentSettings: settings }));
      }
      notice.set("已保存到当前服务器");
      props.onSaved?.();
    } catch (failure) {
      error.set(failure instanceof Error ? failure.message : "全局设置保存失败。");
      uncertain.set(failure instanceof OperationError && !failure.rejected);
    } finally {
      busy.set(false);
      props.onBusy(false);
      clearTimeout(timeout);
    }
  }
  return (
    <View testID="server-settings" class="gap-4">
      <Text class="text-sm text-foreground">{props.connection.name} · 服务器全局默认</Text>
      <Text class="text-xs text-muted-foreground">
        作用于此服务器的项目；项目和会话的显式配置优先。本机编辑器偏好不受影响。
      </Text>
      <If when={loading()}>
        <Text class="text-sm text-quiet">正在读取服务器设置…</Text>
      </If>
      <If when={!!data()}>
        <Text class="text-xs font-medium text-primary">默认模型</Text>
        <Select
          searchable
          accessibilityLabel="服务器默认模型"
          value={selected()}
          disabled={busy() || uncertain()}
          items={[
            ...data()!.modelAliases.map((alias) => ({
              value: alias.name,
              title: `${alias.name} · ${alias.label}`,
              group: "别名",
            })),
            ...data()!.listModels.map((model) => ({
              value: model.slug,
              title: `${model.slug} · ${model.name}`,
              group: model.provider.name,
            })),
          ]}
          onChange={({ value }) => {
            selected.set(value || "");
            notice.set("");
          }}
          popupClass="w-[360px] max-h-[320px] rounded-lg p-1 border border-border bg-popover shadow-lg"
          itemClass="px-3 py-2 rounded focus:bg-accent selected:bg-accent text-sm text-foreground"
          groupClass="px-3 py-2 text-xs text-quiet"
          searchClass="h-8 px-3 text-sm text-foreground"
          searchPlaceholder="搜索模型或别名"
          trigger={
            <View
              testID="global-default-model"
              class="h-9 px-3 flex-row items-center gap-2 rounded border border-border"
            >
              <Text
                class="flex-1 h-5 text-sm text-foreground"
                style={{ numberOfLines: 1, lineHeight: 18, textAlignVertical: "center" }}
              >
                {selected() || "未设置"}
              </Text>
              <Icon name="chevronDown" size={12} />
            </View>
          }
        />
        <Button
          testID="save-global-model"
          class="h-8 px-3 self-end rounded bg-accent disabled:opacity-50"
          disabled={
            busy() || uncertain() || !selected() || selected() === data()!.defaultModelSetting.name
          }
          onPress={() => void save("model")}
        >
          <Text class="text-sm text-primary">保存默认模型</Text>
        </Button>
        <Text class="text-xs font-medium text-primary">代理运行默认值</Text>
        <Each of={runtimeFields}>
          {(item) => (
            <View class="flex-row items-center gap-4">
              <Text class="flex-1 text-sm text-foreground">{item().title}</Text>
              <Input
                testID={`global-runtime-${item().key}`}
                accessibilityLabel={item().title}
                class="h-9 w-28 px-3 rounded border border-border text-sm text-foreground"
                value={values()[item().key]}
                onChange={({ value }) => {
                  if (!busy()) values.update((previous) => ({ ...previous, [item().key]: value }));
                }}
              />
            </View>
          )}
        </Each>
        <Button
          testID="save-global-runtime"
          class="h-8 px-3 self-end rounded bg-accent disabled:opacity-50"
          disabled={busy() || uncertain()}
          onPress={() => void save("runtime")}
        >
          <Text class="text-sm text-primary">{busy() ? "正在保存…" : "保存运行设置"}</Text>
        </Button>
        <Text class="text-xs text-quiet">
          账户凭据、浏览器／电脑授权及系统安全配置不在此表单中修改。
        </Text>
      </If>
      <If when={!!notice()}>
        <Text testID="server-settings-notice" class="text-sm text-primary">
          {notice()}
        </Text>
      </If>
      <If when={!!error()}>
        <Text testID="server-settings-error" class="text-sm text-destructive">
          {error()}
        </Text>
      </If>
      <If when={uncertain()}>
        <Text class="text-xs text-muted-foreground">
          结果不明，已阻止重复保存。请重新打开设置读取核对。
        </Text>
      </If>
      <If when={!data() && !loading()}>
        <Button
          class="h-8 px-3 self-start rounded bg-accent"
          onPress={() => retry.set(retry() + 1)}
        >
          <Text class="text-sm text-primary">重试读取</Text>
        </Button>
      </If>
    </View>
  );
}

import { effect, signal, Text, View } from "nsh";
import { Select } from "nsh/base";
import {
  type ComposerCatalog,
  loadComposerCatalog,
  modelEfforts,
  resolvedModel,
} from "../../api/composer";
import { AppButton as Button } from "../../components/AppButton";
import { Icon } from "../../components/Icon";
import type { ComposerState } from "./composerState";

const catalogRevision = signal(0);
/** A saved project/server default must be reflected by already mounted composers. */
export function invalidateComposerCatalog() {
  catalogRevision.update((value) => value + 1);
}

export function createComposerCatalog(
  scope: () => { url: string; projectId: string; threadId: string },
) {
  const data = signal<ComposerCatalog | null>(null),
    error = signal(""),
    retry = signal(0);
  let previousScope = "",
    loadedAt = 0;
  effect(() => {
    catalogRevision();
    const target = scope();
    retry();
    const key = JSON.stringify(target);
    if (previousScope !== key) {
      data.set(null);
      previousScope = key;
    }
    error.set("");
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 15000);
    let current = true;
    void loadComposerCatalog(target.url, target.projectId, target.threadId, controller.signal)
      .then((value) => {
        if (current) {
          data.set(value);
          loadedAt = Date.now();
        }
      })
      .catch(() => {
        if (current) error.set("模型设置读取失败");
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      current = false;
      controller.abort();
      clearTimeout(timeout);
    };
  });
  return {
    data,
    error,
    retry: () => retry.set(retry() + 1),
    refreshIfStale: () => {
      if (Date.now() - loadedAt > 60000) retry.set(retry() + 1);
    },
  };
}
export function ComposerModels(props: {
  state: ComposerState;
  catalog: ReturnType<typeof createComposerCatalog>;
}) {
  const current = () => {
    const data = props.catalog.data();
    return data ? resolvedModel(data, props.state.draft()().model) : null;
  };
  const choices = () => {
    const data = props.catalog.data();
    if (!data) return [];
    return [
      { value: "__default", title: "跟随会话／项目默认", group: "默认" },
      ...data.modelAliases.map((alias) => ({
        value: alias.name,
        title: `${alias.name} · ${alias.label}`,
        group: "别名",
      })),
      ...data.listModels.map((model) => ({
        value: model.slug,
        title: `${model.slug} · ${model.name} · ${model.provider.name}`,
        group: model.provider.name,
      })),
    ];
  };
  const levels = () => {
    const data = props.catalog.data();
    return data ? modelEfforts(data, props.state.draft()().model) : [];
  };
  const inheritedEffort = () => {
    const data = props.catalog.data(),
      value = current();
    if (!data || !value) return "";
    const selected = props.state.draft()().model;
    return (
      (!selected || selected === data.getThread?.modelSlug
        ? data.getThread?.reasoningEffort
        : null) ??
      (!selected && data.agentDefinition?.model === value.name
        ? data.agentDefinition.effort
        : null) ??
      value.alias?.efforts[0] ??
      value.model?.reasoningEffort ??
      ""
    );
  };
  return (
    <View class="flex-row items-center gap-1 shrink">
      <Select
        testID="composer-model"
        accessibilityLabel="选择模型"
        items={choices()}
        value={props.state.draft()().model || "__default"}
        disabled={!props.catalog.data() || props.state.draft()().sending}
        searchable
        onOpen={props.catalog.refreshIfStale}
        searchTestID="composer-model-search"
        searchPlaceholder="搜索模型、别名或供应商"
        searchAccessibilityLabel="搜索模型"
        placement="top"
        popupClass="w-[360px] max-h-[420px] rounded-lg border border-border bg-background p-1 shadow-lg"
        itemClass="px-3 py-2 rounded focus:bg-accent selected:bg-accent text-xs text-foreground"
        groupClass="px-3 py-2 text-xs text-quiet"
        searchClass="h-8 px-3 text-sm text-foreground placeholder:text-quiet"
        renderItem={(item) => (
          <View testID={`composer-model-${item.value}`} class="gap-1">
            <Text class="text-xs text-foreground">{item.title}</Text>
            <If
              when={!!props.catalog.data()?.modelAliases.find((alias) => alias.name === item.value)}
            >
              <Text class="text-xs text-quiet">
                {props.catalog
                  .data()
                  ?.modelAliases.find((alias) => alias.name === item.value)
                  ?.models.join(" → ") || "跟随默认模型"}
              </Text>
            </If>
          </View>
        )}
        onChange={({ value }) => props.state.model(value === "__default" ? null : value)}
        trigger={
          <View
            testID="composer-model-trigger"
            class="h-7 max-w-[220px] px-2 flex-row items-center justify-center gap-1 rounded hover:bg-accent"
          >
            <Text
              class="shrink h-5 text-xs text-foreground"
              style={{ numberOfLines: 1, lineHeight: 16, textAlignVertical: "center" }}
            >
              {current()?.name || (props.catalog.error() ? "模型读取失败" : "读取模型…")}
            </Text>
            <Icon name="chevronDown" size={12} />
          </View>
        }
      />
      <If when={levels().length > 0}>
        <Select
          accessibilityLabel="推理强度"
          value={props.state.draft()().effort || "__default"}
          items={[
            {
              value: "__default",
              title: `${current()?.alias ? "跟随别名" : "默认档位"}${inheritedEffort() ? `（${inheritedEffort()}）` : ""}`,
            },
            ...levels().map((level) => ({ value: level, title: level })),
          ]}
          onChange={({ value }) => props.state.effort(value === "__default" ? null : value)}
          placement="top"
          popupClass="w-[240px] max-h-[360px] rounded-lg border border-border bg-background p-1 shadow-lg"
          itemClass="px-3 py-2 rounded focus:bg-accent selected:bg-accent text-xs text-foreground"
          renderItem={(item) => (
            <View testID={`composer-effort-${item.value}`}>
              <Text class="text-xs text-foreground" style={{ numberOfLines: 1, lineHeight: 18 }}>
                {item.title}
              </Text>
            </View>
          )}
          trigger={
            <View
              testID="composer-effort-trigger"
              class="h-7 px-2 flex-row items-center justify-center gap-1 rounded hover:bg-accent"
            >
              <Text
                class="h-5 text-xs text-quiet"
                style={{ lineHeight: 16, textAlignVertical: "center" }}
              >
                {props.state.draft()().effort || inheritedEffort() || "默认档"}
              </Text>
              <Icon name="chevronDown" size={12} />
            </View>
          }
        />
      </If>
      <If when={!!props.catalog.error()}>
        <Button
          testID="composer-model-retry"
          class="h-7 px-2 rounded hover:bg-accent"
          onPress={props.catalog.retry}
        >
          <Text class="text-xs text-destructive">重试</Text>
        </Button>
      </If>
    </View>
  );
}

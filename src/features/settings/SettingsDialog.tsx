import { Scroll, signal, Text, View } from "nsh";
import { Dialog, NumberInput, Select, Switch, Tab, Tabs } from "nsh/base";
import { AppButton as Button } from "../../components/AppButton";
import { Icon } from "../../components/Icon";
import { type ThemeState, themes } from "../../theme/themes";
import type { ProjectConnection } from "../projects/ProjectDirectoryDialog";
import { type EditorSettings, editorFonts } from "./editorSettings";
import { ServerSettings } from "./ServerSettings";

export function SettingsDialog(props: {
  settings: EditorSettings;
  onClose: () => void;
  theme?: ThemeState;
  connection?: ProjectConnection | null;
  isCurrentServer?: () => boolean;
  onServerSaved?: () => void;
  onBusy?: (busy: boolean) => void;
}) {
  const settings = props.settings;
  const value = settings.current;
  const compact = signal(false);
  const section = signal<"local" | "server">("local"),
    remoteBusy = signal(false);
  const fieldClass = () => (compact() ? "gap-2" : "flex-row items-center gap-4");
  const choiceClass =
    "h-8 w-44 px-3 flex-row items-center justify-between rounded border border-border bg-background";
  const popupClass = "w-44 p-1 rounded border border-border bg-popover shadow-lg";
  const toggles = [
    { key: "softWrap", title: "自动换行", detail: "长行在编辑区域宽度内折行，不改变文件内容。" },
    { key: "lineNumbers", title: "行号", detail: "在编辑器左侧显示行号。" },
    { key: "indentGuides", title: "缩进引导线", detail: "显示代码的缩进层级。" },
    { key: "activeLine", title: "当前行高亮", detail: "突出显示光标所在的行。" },
    { key: "showWhitespaces", title: "显示空白字符", detail: "用标记显示空格与 Tab。" },
  ] as const;
  return (
    <Dialog
      testID="settings-dialog"
      open={true}
      accessibilityLabel="设置"
      animation="fade"
      onOpenChange={(event) => {
        if (!event.open && !remoteBusy()) props.onClose();
      }}
      class="w-[680px] h-[680px] max-w-[94%] max-h-[90%] m-auto rounded-xl border border-border bg-background shadow-lg"
      backdropClass="bg-overlay/20"
    >
      <View class="px-6 py-4 border-b border-border flex-row items-center gap-3">
        <View class="flex-1 gap-1">
          <Text class="text-lg font-medium text-foreground">Settings · 设置</Text>
          <Text class="text-xs text-muted-foreground">
            全局设置 · 本机偏好与服务器默认值分开管理
          </Text>
        </View>
        <Button
          testID="close-settings"
          accessibilityLabel="关闭设置"
          onPress={props.onClose}
          disabled={remoteBusy()}
          class="h-8 px-3 rounded hover:bg-accent"
        >
          <Text class="text-sm text-foreground">完成</Text>
        </Button>
      </View>
      <Tabs class="h-10 px-5 flex-row items-center gap-2 border-b border-border">
        <Tab
          testID="settings-local-tab"
          selected={section() === "local"}
          disabled={remoteBusy()}
          onPress={() => section.set("local")}
          class="h-8 px-3 flex-row items-center justify-center rounded selected:bg-accent"
        >
          <Text class="text-sm text-foreground">外观与编辑器</Text>
        </Tab>
        <Tab
          testID="settings-server-tab"
          selected={section() === "server"}
          disabled={!props.connection || remoteBusy()}
          onPress={() => section.set("server")}
          class="h-8 px-3 flex-row items-center justify-center rounded selected:bg-accent"
        >
          <Text class="text-sm text-foreground">模型与运行</Text>
        </Tab>
      </Tabs>
      <If when={section() === "local"}>
        <Scroll testID="settings-body" class="flex-1">
          <View
            class="px-6 py-4 gap-5"
            onLayout={(event) => compact.set(event.bounds.size.width < 560)}
          >
            <If when={!!props.theme}>
              <Text class="text-xs font-medium text-primary">外观</Text>
              <Select
                accessibilityLabel="外观主题"
                value={props.theme?.current().id}
                items={themes.map((theme) => ({ value: theme.id, title: theme.name }))}
                onChange={({ value }) => {
                  if (value) props.theme?.select(value);
                }}
                popupClass="w-44 p-1 rounded border border-border bg-popover shadow-lg"
                itemClass="h-8 px-3 rounded text-foreground focus:bg-accent selected:bg-accent"
                trigger={
                  <View
                    testID="settings-appearance"
                    class="h-8 px-3 flex-row items-center justify-between rounded border border-border"
                  >
                    <Text
                      class="h-5 text-sm text-foreground"
                      style={{ lineHeight: 18, textAlignVertical: "center" }}
                    >
                      {props.theme?.current().name}
                    </Text>
                    <Icon name="chevronDown" size={12} />
                  </View>
                }
              />
            </If>
            <Text class="text-xs font-medium text-primary">字体与排版</Text>
            <View class={fieldClass()}>
              <View class={compact() ? "gap-1" : "flex-1 min-w-0 gap-1"}>
                <Text class="text-sm text-foreground">编辑器字体</Text>
                <Text class="text-xs text-muted-foreground">
                  仅使用本机字体；缺失时由系统回退。
                </Text>
              </View>
              <Select
                testID="setting-font-family"
                accessibilityLabel="编辑器字体"
                items={editorFonts}
                value={value().fontFamily}
                onChange={(event) => {
                  if (event.value) settings.update("fontFamily", event.value);
                }}
                popupClass={popupClass}
                itemClass="h-8 px-3 rounded text-foreground focus:bg-accent"
                trigger={
                  <View testID="setting-font-family-trigger" class={choiceClass}>
                    <Text
                      class="h-5 text-sm text-foreground"
                      style={{ lineHeight: 18, textAlignVertical: "center" }}
                    >
                      {editorFonts.find((font) => font.value === value().fontFamily)?.title}
                    </Text>
                    <Icon name="chevronDown" size={12} />
                  </View>
                }
              />
            </View>
            <Each
              of={[
                {
                  key: "fontSize" as const,
                  title: "字体大小",
                  detail: "8–40 pt，同时应用到 Git 差异视图。",
                  min: 8,
                  max: 40,
                  step: 1,
                },
                {
                  key: "lineHeight" as const,
                  title: "行高",
                  detail: "字号的倍数，1.2–2.4。",
                  min: 1.2,
                  max: 2.4,
                  step: 0.1,
                },
              ]}
            >
              {(item) => (
                <View class={fieldClass()}>
                  <View class={compact() ? "gap-1" : "flex-1 min-w-0 gap-1"}>
                    <Text class="text-sm text-foreground">{item().title}</Text>
                    <Text class="text-xs text-muted-foreground">{item().detail}</Text>
                  </View>
                  <NumberInput
                    testID={`setting-${item().key}`}
                    accessibilityLabel={item().title}
                    value={value()[item().key]}
                    min={item().min}
                    max={item().max}
                    step={item().step}
                    onChange={(event) => {
                      if (
                        event.value !== null &&
                        event.value >= item().min &&
                        event.value <= item().max
                      )
                        settings.update(item().key, event.value);
                    }}
                    class="w-44 h-8 flex-row rounded border border-border bg-background"
                    inputClass="flex-1 text-sm text-center text-foreground"
                    decrementButtonClass="w-8 items-center justify-center hover:bg-accent disabled:opacity-40"
                    incrementButtonClass="w-8 items-center justify-center hover:bg-accent disabled:opacity-40"
                    decrementButton={<Text class="text-foreground">−</Text>}
                    incrementButton={<Text class="text-foreground">+</Text>}
                  />
                </View>
              )}
            </Each>
            <View class={fieldClass()}>
              <View class={compact() ? "gap-1" : "flex-1 min-w-0 gap-1"}>
                <Text class="text-sm text-foreground">Tab 宽度</Text>
                <Text class="text-xs text-muted-foreground">
                  不转换已有缩进；跟随语言时采用编辑器默认值。
                </Text>
              </View>
              <Select
                testID="setting-tab-size"
                accessibilityLabel="Tab 宽度"
                items={[
                  { value: "0", title: "跟随语言" },
                  ...[2, 4, 8].map((size) => ({ value: String(size), title: `${size} 个空格宽` })),
                ]}
                value={String(value().tabSize)}
                onChange={(event) => {
                  if (event.value) settings.update("tabSize", Number(event.value));
                }}
                popupClass={popupClass}
                itemClass="h-8 px-3 rounded text-foreground focus:bg-accent"
                trigger={
                  <View testID="setting-tab-size-trigger" class={choiceClass}>
                    <Text
                      class="h-5 text-sm text-foreground"
                      style={{ lineHeight: 18, textAlignVertical: "center" }}
                    >
                      {value().tabSize ? `${value().tabSize} 个空格宽` : "跟随语言"}
                    </Text>
                    <Icon name="chevronDown" size={12} />
                  </View>
                }
              />
            </View>
            <Text class="pt-2 text-xs font-medium text-primary">显示</Text>
            <Each of={toggles}>
              {(item) => (
                <View class="flex-row items-center gap-4">
                  <View class="flex-1 min-w-0 gap-1">
                    <Text class="text-sm text-foreground">{item().title}</Text>
                    <Text class="text-xs text-muted-foreground">{item().detail}</Text>
                  </View>
                  <Switch
                    testID={`setting-${item().key}`}
                    accessibilityLabel={item().title}
                    checked={value()[item().key]}
                    onChange={(event) => settings.update(item().key, event.checked)}
                    class="flex-row items-center"
                    trackClass="w-10 p-0.5 rounded-full bg-border checked:bg-primary"
                    thumbClass="size-4 rounded-full bg-background checked:translate-x-5"
                  />
                </View>
              )}
            </Each>
          </View>
        </Scroll>
        <View class="px-6 py-3 border-t border-border flex-row items-center gap-3">
          <Text testID="settings-save-status" class="flex-1 text-xs text-muted-foreground">
            {settings.status() === "error"
              ? "无法读取或保存偏好；当前设置仍在本窗口生效。"
              : settings.status() === "saving"
                ? "正在保存…"
                : settings.status() === "loading"
                  ? "正在读取设置…"
                  : "已保存到本机"}
          </Text>
          <If when={settings.status() === "error"}>
            <Button
              testID="retry-settings"
              onPress={settings.retry}
              class="h-8 px-3 rounded bg-accent"
            >
              <Text class="text-sm text-primary">重试保存</Text>
            </Button>
          </If>
          <Button
            testID="reset-editor-settings"
            onPress={settings.reset}
            class="h-8 px-3 rounded hover:bg-accent"
          >
            <Text class="text-sm text-foreground">恢复默认</Text>
          </Button>
        </View>
      </If>
      <If when={section() === "server" && !!props.connection}>
        <Scroll testID="settings-server-body" class="flex-1">
          <View class="p-5">
            <ServerSettings
              connection={props.connection!}
              isCurrent={props.isCurrentServer ?? (() => true)}
              onBusy={(busy) => {
                remoteBusy.set(busy);
                props.onBusy?.(busy);
              }}
              onSaved={props.onServerSaved}
            />
          </View>
        </Scroll>
      </If>
    </Dialog>
  );
}

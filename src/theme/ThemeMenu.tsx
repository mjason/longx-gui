import { Text, View } from "nsh";
import { Menu, MenuItem } from "nsh/base";
import { type ThemeState, themes } from "./themes";

export function ThemeMenu(props: { theme: ThemeState; onSettings: () => void }) {
  return (
    <Menu
      placement="top"
      align="end"
      popupClass="w-52 p-1 rounded-lg border border-border bg-popover shadow-lg"
      trigger={
        <View
          testID="theme-menu"
          role="button"
          accessibilityLabel="切换主题"
          class="h-5 px-2 justify-center rounded hover:bg-accent"
        >
          <Text testID="current-theme" class="text-xs text-muted-foreground">
            {props.theme.current().name}
          </Text>
        </View>
      }
    >
      <Text class="px-3 py-2 text-xs text-quiet">外观主题</Text>
      <Each of={themes}>
        {(theme) => (
          <MenuItem
            testID={`theme-${theme().id}`}
            role="menuitemradio"
            checked={props.theme.current().id === theme().id}
            onSelect={() => props.theme.select(theme().id)}
            class="group h-8 px-3 flex-row items-center rounded hover:bg-accent focus:bg-accent"
            indicator={<Text class="text-primary opacity-0 group-checked:opacity-100">✓</Text>}
          >
            <Text class="text-sm text-foreground">{theme().name}</Text>
          </MenuItem>
        )}
      </Each>
      <MenuItem
        testID="open-settings"
        onSelect={props.onSettings}
        class="h-8 px-3 rounded hover:bg-accent focus:bg-accent"
      >
        <Text class="text-sm text-foreground">Settings… · 设置</Text>
      </MenuItem>
      <If when={props.theme.persistenceError()}>
        <Text class="px-3 py-2 text-xs text-destructive">主题已应用，但无法保存偏好</Text>
      </If>
    </Menu>
  );
}

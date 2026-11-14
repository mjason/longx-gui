import { Image, token } from "nsh";
import assistant from "../../assets/assistant.svg";
import bot from "../../assets/bot.svg";
import branch from "../../assets/branch.svg";
import chat from "../../assets/chat.svg";
import chevron from "../../assets/chevron.svg";
import chevronDown from "../../assets/chevron-down.svg";
import close from "../../assets/close.svg";
import file from "../../assets/file.svg";
import home from "../../assets/home.svg";
import monitor from "../../assets/monitor.svg";
import panel from "../../assets/panel.svg";
import plus from "../../assets/plus.svg";
import folder from "../../assets/project.svg";
import search from "../../assets/search.svg";
import settings from "../../assets/settings.svg";
import user from "../../assets/user.svg";

const icons = {
  user,
  assistant,
  chat,
  branch,
  bot,
  folder,
  file,
  close,
  chevron,
  chevronDown,
  plus,
  home,
  settings,
  monitor,
  search,
  panel,
};
export type IconName = keyof typeof icons;

export function Icon(props: { name: IconName; color?: string; size?: number }) {
  return (
    <Image
      src={icons[props.name]}
      style={{
        width: props.size ?? 20,
        height: props.size ?? 20,
        tintColor: props.color ?? token("muted-foreground"),
        flexShrink: 0,
      }}
    />
  );
}

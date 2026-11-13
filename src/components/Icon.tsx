import { token, Image } from "nsh";
import chat from "../../assets/chat.svg";
import branch from "../../assets/branch.svg";
import bot from "../../assets/bot.svg";
import folder from "../../assets/project.svg";
import file from "../../assets/file.svg";
import close from "../../assets/close.svg";
import chevron from "../../assets/chevron.svg";
import home from "../../assets/home.svg";
import settings from "../../assets/settings.svg";
import monitor from "../../assets/monitor.svg";
import search from "../../assets/search.svg";
import panel from "../../assets/panel.svg";

const icons = { chat, branch, bot, folder, file, close, chevron, home, settings, monitor, search, panel };
export type IconName = keyof typeof icons;

export function Icon(props: { name: IconName; color?: string; size?: number }) {
  return <Image src={icons[props.name]} style={{
    width: props.size ?? 20, height: props.size ?? 20,
    tintColor: props.color ?? token("muted-foreground"), flexShrink: 0,
  }} />;
}

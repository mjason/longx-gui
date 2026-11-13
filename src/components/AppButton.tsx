import { Button, type ButtonProps } from "nsh/base";

/** Native press/keyboard/disabled behavior, with explicit two-axis alignment. */
export function AppButton(props: ButtonProps) {
  return <Button {...props} class={`flex-row items-center justify-center ${props.class ?? ""}`} />;
}

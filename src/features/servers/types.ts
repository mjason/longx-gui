import type { ImageAsset } from "nsh";

export interface ServerIcon {
  src: ImageAsset;
  color: "teal" | "purple" | "ochre" | "primary";
  variant: number;
}

export interface Server {
  id: number;
  name: string;
  url: string;
  icon: ServerIcon;
}

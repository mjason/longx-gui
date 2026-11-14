import cloudIcon from "../../../assets/cloud.svg";
import compassIcon from "../../../assets/compass.svg";
import cubeIcon from "../../../assets/cube.svg";
import globeIcon from "../../../assets/globe.svg";
import layersIcon from "../../../assets/layers.svg";
import leafIcon from "../../../assets/leaf.svg";
import type { ServerIcon } from "./types";

const variants: Omit<ServerIcon, "variant">[] = [
  { src: globeIcon, color: "teal" },
  { src: layersIcon, color: "purple" },
  { src: cloudIcon, color: "teal" },
  { src: compassIcon, color: "ochre" },
  { src: cubeIcon, color: "teal" },
  { src: leafIcon, color: "primary" },
];

// Shuffle once, never during rendering; the first six servers are distinct.
const order = variants.map((_, index) => index);
for (let index = order.length - 1; index > 0; index--) {
  const other = Math.floor(Math.random() * (index + 1));
  [order[index], order[other]] = [order[other], order[index]];
}

export function createServerIcon(id: number): ServerIcon {
  const variant = order[(id - 1) % order.length];
  return { ...variants[variant], variant };
}

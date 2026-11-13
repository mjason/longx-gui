import globeIcon from "../../../assets/globe.svg";
import layersIcon from "../../../assets/layers.svg";
import cloudIcon from "../../../assets/cloud.svg";
import compassIcon from "../../../assets/compass.svg";
import cubeIcon from "../../../assets/cube.svg";
import leafIcon from "../../../assets/leaf.svg";
import type { ServerIcon } from "./types";

const variants = [
  { src: globeIcon, color: "#4478bc" },
  { src: layersIcon, color: "#8666ad" },
  { src: cloudIcon, color: "#42919b" },
  { src: compassIcon, color: "#bc7750" },
  { src: cubeIcon, color: "#658586" },
  { src: leafIcon, color: "#60916c" },
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

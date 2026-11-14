import { type ChannelSocket, subscribeChannel } from "./channel";

export type ProjectSocket = ChannelSocket;
export function subscribeProject(options: {
  url: string;
  projectId: string;
  ready: (connected: boolean) => void;
  joined: (reconnected: boolean) => void;
  git: () => void;
  files: (paths: string[] | undefined) => void;
  socket?: (url: string) => ProjectSocket;
  clock?: Parameters<typeof subscribeChannel>[0]["clock"];
}) {
  return subscribeChannel({
    ...options,
    topic: `project:${options.projectId}`,
    joined: (_, reconnected) => options.joined(reconnected),
    event: (name, payload) => {
      if (name === "git") options.git();
      if (name === "files") {
        const paths = (payload as { paths?: unknown } | null)?.paths;
        options.files(
          Array.isArray(paths) && paths.every((path) => typeof path === "string")
            ? paths
            : undefined,
        );
      }
    },
  }).stop;
}

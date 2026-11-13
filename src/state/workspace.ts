import { signal } from "nsh";
import { createServerIcon } from "../features/servers/icons";
import type { Server } from "../features/servers/types";

/** Window-local state only: no connections, persistence or remote deletion. */
export function createWorkspaceState() {
  const servers = signal<Server[]>([1, 2, 3].map(id => ({
    id, name: `服务器 ${id}`, url: "", icon: createServerIcon(id),
  })));
  const selectedServer = signal(1);
  const selectedProjects = signal<Record<number, number>>({});
  let nextId = 4;

  function closeServer(id: number) {
    const values = servers();
    const index = values.findIndex(server => server.id === id);
    if (index < 0) return;
    if (selectedServer() === id) {
      selectedServer.set(values[index + 1]?.id ?? values[index - 1]?.id ?? 0);
    }
    servers.set(values.filter(server => server.id !== id));
    selectedProjects.update(values => {
      const remaining = { ...values };
      delete remaining[id];
      return remaining;
    });
  }

  function addServer(name: string, address: string) {
    const url = new URL(address.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error("请填写有效的 HTTP / HTTPS 地址；不要包含账号、密码、查询参数或片段。");
    }
    const normalized = url.href.replace(/\/+$/, "");
    const existing = servers().find(server => server.url === normalized);
    if (existing) selectedServer.set(existing.id);
    else {
      const id = nextId++;
      servers.update(values => [...values, {
        id, name: name.trim() || url.host, url: normalized, icon: createServerIcon(id),
      }]);
      selectedServer.set(id);
    }
  }

  return {
    servers,
    selectedServer,
    selectedProject: () => selectedProjects()[selectedServer()] ?? 1,
    selectServer: selectedServer.set,
    selectProject: (project: number) => selectedProjects.update(values => ({
      ...values, [selectedServer()]: project,
    })),
    addServer,
    closeServer,
  };
}

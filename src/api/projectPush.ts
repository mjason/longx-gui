/** Phoenix Channels V2 JSON transport. No browser cookies, credentials or framework dependency. */
export type ProjectSocket = Pick<
  WebSocket,
  "onopen" | "onmessage" | "onerror" | "onclose" | "send" | "close"
>;
interface Clock {
  set: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clear: (timer: ReturnType<typeof setTimeout> | undefined) => void;
}
export function subscribeProject(options: {
  url: string;
  projectId: string;
  ready: (connected: boolean) => void;
  joined: (reconnected: boolean) => void;
  git: () => void;
  files: (paths: string[] | undefined) => void;
  socket?: (url: string) => ProjectSocket;
  clock?: Clock;
}) {
  const endpoint = new URL(`${options.url.replace(/\/+$/, "")}/socket/websocket`);
  endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
  endpoint.searchParams.set("vsn", "2.0.0");
  const topic = `project:${options.projectId}`;
  const clock = options.clock ?? { set: setTimeout, clear: clearTimeout };
  let socket: ProjectSocket | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let sequence = 0;
  let attempts = 0;
  let everJoined = false;
  let joined = false;
  let joinRef = "";
  let heartbeat: string | undefined;
  function send(event: string, payload: object, channel = topic) {
    const ref = String(++sequence);
    socket?.send(
      JSON.stringify([channel === topic ? joinRef : null, ref, channel, event, payload]),
    );
    return ref;
  }
  function detach() {
    clock.clear(timer);
    const old = socket;
    socket = undefined;
    if (old) {
      old.onopen = old.onmessage = old.onerror = old.onclose = null;
      old.close();
    }
  }
  function failed() {
    if (stopped) return;
    joined = false;
    heartbeat = undefined;
    detach();
    options.ready(false);
    timer = clock.set(connect, Math.min(1000 * 2 ** Math.min(attempts++, 5), 30000));
  }
  function pulse() {
    if (heartbeat) return failed();
    try {
      heartbeat = send("heartbeat", {}, "phoenix");
      timer = clock.set(pulse, 25000);
    } catch {
      failed();
    }
  }
  function connect() {
    if (stopped) return;
    try {
      const current = (options.socket ?? ((url) => new WebSocket(url)))(endpoint.toString());
      socket = current;
      timer = clock.set(failed, 10000);
      current.onopen = () => {
        if (stopped || socket !== current) return;
        try {
          joinRef = String(sequence + 1);
          send("phx_join", {});
        } catch {
          failed();
        }
      };
      current.onmessage = (event) => {
        if (stopped || socket !== current || typeof event.data !== "string") return;
        let frame: unknown;
        try {
          frame = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!Array.isArray(frame) || frame.length !== 5) return;
        const [join, ref, channel, name, payload] = frame;
        if (channel === "phoenix" && name === "phx_reply" && ref === heartbeat) {
          heartbeat = undefined;
          return;
        }
        if (channel !== topic || (join !== null && join !== joinRef)) return;
        if (name === "phx_error" || name === "phx_close") return failed();
        if (name === "phx_reply" && ref === joinRef && !joined) {
          if (payload?.status !== "ok") return failed();
          clock.clear(timer);
          joined = true;
          attempts = 0;
          options.ready(true);
          options.joined(everJoined);
          everJoined = true;
          timer = clock.set(pulse, 25000);
        } else if (joined && name === "git") options.git();
        else if (joined && name === "files") {
          const paths = payload?.paths;
          options.files(
            Array.isArray(paths) && paths.every((path) => typeof path === "string")
              ? paths
              : undefined,
          );
        }
      };
      current.onerror = current.onclose = () => {
        if (socket === current) failed();
      };
    } catch {
      failed();
    }
  }
  connect();
  return () => {
    stopped = true;
    if (joined) {
      try {
        send("phx_leave", {});
      } catch {
        /* Transport may already be closed. */
      }
    }
    detach();
  };
}

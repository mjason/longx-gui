/** Phoenix Channels V2 JSON transport. No browser cookies, credentials or framework dependency. */
export type ChannelSocket = Pick<
  WebSocket,
  "onopen" | "onmessage" | "onerror" | "onclose" | "send" | "close"
>;
interface Clock {
  set: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clear: (timer: ReturnType<typeof setTimeout> | undefined) => void;
}
export function subscribeChannel(options: {
  url: string;
  topic: string;
  params?: () => object;
  ready: (connected: boolean) => void;
  joined: (snapshot: unknown, reconnected: boolean) => void;
  event: (name: string, payload: unknown) => void;
  error?: () => void;
  socket?: (url: string) => ChannelSocket;
  clock?: Clock;
}) {
  const endpoint = new URL(`${options.url.replace(/\/+$/, "")}/socket/websocket`);
  endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
  endpoint.searchParams.set("vsn", "2.0.0");
  const topic = options.topic;
  const clock = options.clock ?? { set: setTimeout, clear: clearTimeout };
  let socket: ChannelSocket | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let sequence = 0;
  let attempts = 0;
  let everJoined = false;
  let joined = false;
  let joinRef = "";
  let heartbeat: string | undefined;
  const requests = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  function send(event: string, payload: object, channel = topic) {
    const ref = String(++sequence);
    socket?.send(
      JSON.stringify([channel === topic ? joinRef : null, ref, channel, event, payload]),
    );
    return ref;
  }
  function detach() {
    clock.clear(timer);
    for (const request of requests.values()) {
      clock.clear(request.timer);
      request.reject(new Error("连接已断开，请重试。"));
    }
    requests.clear();
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
    options.error?.();
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
          send("phx_join", options.params?.() ?? {});
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
          options.joined(payload.response, everJoined);
          everJoined = true;
          timer = clock.set(pulse, 25000);
        } else if (joined && name === "phx_reply") {
          const request = requests.get(ref);
          if (!request) return;
          requests.delete(ref);
          clock.clear(request.timer);
          if (payload?.status === "ok") request.resolve(payload.response);
          else request.reject(new Error("服务拒绝读取会话记录。"));
        } else if (joined) options.event(name, payload);
      };
      current.onerror = current.onclose = () => {
        if (socket === current) failed();
      };
    } catch {
      failed();
    }
  }
  connect();
  const stop = () => {
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
  return {
    stop,
    request(event: string, payload: object): Promise<unknown> {
      if (stopped || !joined) return Promise.reject(new Error("尚未连接到会话。"));
      return new Promise((resolve, reject) => {
        try {
          const ref = send(event, payload);
          requests.set(ref, {
            resolve,
            reject,
            timer: clock.set(() => {
              requests.delete(ref);
              reject(new Error("读取会话超时，请重试。"));
            }, 10000),
          });
        } catch {
          reject(new Error("请求发送失败，请重试。"));
        }
      });
    },
  };
}

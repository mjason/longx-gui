import { expect, test } from "nsh/test";
import { type ProjectSocket, subscribeProject } from "./src/api/projectPush";

function setup() {
  let now = 0,
    nextTimer = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  const sockets: ReturnType<typeof makeSocket>[] = [];
  const events: string[] = [];
  const files: (string[] | undefined)[] = [];
  const urls: string[] = [];
  function makeSocket() {
    const sent: unknown[][] = [];
    let closed = false;
    const socket: ProjectSocket = {
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      send(data) {
        sent.push(JSON.parse(String(data)));
      },
      close() {
        closed = true;
      },
    };
    return {
      socket,
      sent,
      closed: () => closed,
      open: () => socket.onopen?.(new Event("open")),
      receive: (frame: unknown) =>
        socket.onmessage?.(Object.assign(new Event("message"), { data: JSON.stringify(frame) })),
      join() {
        this.open();
        const [ref] = sent[0];
        this.receive([ref, ref, "project:p1", "phx_reply", { status: "ok" }]);
      },
    };
  }
  const stop = subscribeProject({
    url: "https://example.test/base",
    projectId: "p1",
    ready: (value) => events.push(`ready:${value}`),
    joined: (value) => events.push(`joined:${value}`),
    git: () => events.push("git"),
    files: (paths) => files.push(paths),
    socket: (url) => {
      urls.push(url);
      const value = makeSocket();
      sockets.push(value);
      return value.socket;
    },
    clock: {
      set(run, ms) {
        const id = ++nextTimer;
        timers.set(id, { at: now + ms, run });
        return id;
      },
      clear(id) {
        if (id !== undefined) timers.delete(id);
      },
    },
  });
  function advance(ms: number) {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at;
      timers.delete(due[0]);
      due[1].run();
    }
    now = end;
  }
  return { sockets, events, files, urls, advance, stop };
}

test("joins Phoenix V2 project channel and only dispatches matching joined project events", () => {
  const h = setup(),
    first = h.sockets[0];
  expect(h.urls[0]).toBe("wss://example.test/base/socket/websocket?vsn=2.0.0");
  first.receive([null, null, "project:p1", "git", {}]);
  expect(h.events.length).toBe(0);
  first.join();
  expect(first.sent[0]).toEqual(["1", "1", "project:p1", "phx_join", {}]);
  first.receive([null, null, "project:other", "git", {}]);
  first.receive(["stale", null, "project:p1", "git", {}]);
  first.receive([null, null, "project:p1", "git", {}]);
  first.receive([null, null, "project:p1", "files", { paths: ["src/a.ts"] }]);
  first.receive([null, null, "project:p1", "files", { paths: [42] }]);
  expect(h.events).toEqual(["ready:true", "joined:false", "git"]);
  expect(h.files).toEqual([["src/a.ts"], undefined]);
  h.stop();
});

test("heartbeats acknowledge correctly and a missing reply reconnects then reports catch-up", () => {
  const h = setup(),
    first = h.sockets[0];
  first.join();
  h.advance(25000);
  const heartbeat = first.sent[1];
  expect(heartbeat.slice(2, 4)).toEqual(["phoenix", "heartbeat"]);
  first.receive([null, heartbeat[1], "phoenix", "phx_reply", { status: "ok" }]);
  h.advance(25000);
  expect(first.closed()).toBe(false);
  h.advance(25000);
  expect(first.closed()).toBe(true);
  expect(h.events).toContain("ready:false");
  h.advance(1000);
  h.sockets[1].join();
  expect(h.events).toContain("joined:true");
  h.stop();
});

test("retries rejected and timed-out joins with backoff, and disposal cancels reconnects", () => {
  const h = setup(),
    first = h.sockets[0];
  first.open();
  first.receive(["1", "1", "project:p1", "phx_reply", { status: "error" }]);
  h.advance(1000);
  expect(h.sockets.length).toBe(2);
  h.advance(10000);
  expect(h.sockets[1].closed()).toBe(true);
  h.advance(1999);
  expect(h.sockets.length).toBe(2);
  h.advance(1);
  expect(h.sockets.length).toBe(3);
  h.stop();
  h.advance(120000);
  expect(h.sockets.length).toBe(3);
});

test("leaves the project and ignores late callbacks after scope disposal", () => {
  const h = setup(),
    first = h.sockets[0];
  first.join();
  const late = first.socket.onmessage;
  h.stop();
  expect(first.sent[1][3]).toBe("phx_leave");
  expect(first.closed()).toBe(true);
  late?.(
    Object.assign(new Event("message"), {
      data: JSON.stringify([null, null, "project:p1", "git", {}]),
    }),
  );
  expect(h.events.includes("git")).toBe(false);
  h.advance(120000);
  expect(h.sockets.length).toBe(1);
});

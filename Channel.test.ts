import { expect, test } from "nsh/test";
import { type ChannelSocket, subscribeChannel } from "./src/api/channel";

test("thread channels send dynamic snapshot limits and correlate read-only history replies", async () => {
  const sent: unknown[][] = [];
  const socket: ChannelSocket = {
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send(data) {
      sent.push(JSON.parse(String(data)));
    },
    close() {},
  };
  let joined: unknown;
  const receive = (value: unknown) =>
    socket.onmessage?.(Object.assign(new Event("message"), { data: JSON.stringify(value) }));
  const channel = subscribeChannel({
    url: "http://fixture.test",
    topic: "thread:kernel-t1",
    params: () => ({ limit: 80 }),
    ready: () => {},
    joined: (data) => {
      joined = data;
    },
    event: () => {},
    socket: () => socket,
  });
  socket.onopen?.(new Event("open"));
  expect(sent[0]).toEqual(["1", "1", "thread:kernel-t1", "phx_join", { limit: 80 }]);
  receive(["1", "1", "thread:kernel-t1", "phx_reply", { status: "ok", response: { seq: 4 } }]);
  expect(joined).toEqual({ seq: 4 });
  const pending = channel.request("earlier", { before: "item-5", limit: 80 });
  const ref = sent[1][1];
  expect(sent[1][3]).toBe("earlier");
  receive(["1", ref, "thread:another", "phx_reply", { status: "ok", response: "wrong" }]);
  receive(["1", ref, "thread:kernel-t1", "phx_reply", { status: "ok", response: { items: [] } }]);
  expect(await pending).toEqual({ items: [] });
  channel.stop();
});
test("closing a thread channel rejects outstanding history reads and prevents new requests", async () => {
  const sent: unknown[][] = [];
  const socket: ChannelSocket = {
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send(data) {
      sent.push(JSON.parse(String(data)));
    },
    close() {},
  };
  const channel = subscribeChannel({
    url: "http://fixture.test",
    topic: "thread:k",
    ready: () => {},
    joined: () => {},
    event: () => {},
    socket: () => socket,
  });
  socket.onopen?.(new Event("open"));
  socket.onmessage?.(
    Object.assign(new Event("message"), {
      data: JSON.stringify(["1", "1", "thread:k", "phx_reply", { status: "ok", response: {} }]),
    }),
  );
  let failed = false,
    after = false;
  const pending = channel.request("earlier", {}).catch(() => {
    failed = true;
  });
  channel.stop();
  await pending;
  await channel.request("snapshot", {}).catch(() => {
    after = true;
  });
  expect(failed).toBe(true);
  expect(after).toBe(true);
});

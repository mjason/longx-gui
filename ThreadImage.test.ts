import { expect, test } from "nsh/test";
import { threadImageSource } from "./src/features/threads/ThreadImage";

test("thread images resolve against the selected server and reject local or executable sources", () => {
  const base = "https://server.example";
  expect(threadImageSource("/attachments/one.png", base)).toBe(
    "https://server.example/attachments/one.png",
  );
  expect(threadImageSource("https://images.example/a.png", base)).toBe(
    "https://images.example/a.png",
  );
  expect(threadImageSource("data:image/png;base64,AAAA", base)).toBe("data:image/png;base64,AAAA");
  for (const source of [
    "",
    "file:///private/a.png",
    "javascript:alert(1)",
    "data:text/html,hi",
    "https://user:pass@example.com/a",
  ]) {
    expect(threadImageSource(source, base)).toBe("");
  }
});

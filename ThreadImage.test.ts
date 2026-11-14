import { expect, test } from "nsh/test";
import { isThreadAttachment } from "./src/api/threadImages";
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
test("private attachment sessions never travel to another origin", () => {
  expect(
    isThreadAttachment(
      "https://server.example/files/p/_attachments/a.png",
      "https://server.example",
    ),
  ).toBe(true);
  expect(
    isThreadAttachment(
      "https://other.example/files/p/_attachments/a.png",
      "https://server.example",
    ),
  ).toBe(false);
  expect(isThreadAttachment("data:image/png;base64,AAA", "https://server.example")).toBe(false);
});

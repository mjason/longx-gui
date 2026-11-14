import { expect, open, test } from "nsh/test";
import { reasoningPresentation, reasoningRuns } from "./src/features/threads/reasoningPresentation";

test("a one-line reasoning summary is process text, not a Markdown heading document", async () => {
  const app = await open("./tests/fixtures/ReasoningHarness.tsx", { width: 800, height: 600 });
  expect(app.count("id:reasoning-summary-reason")).toBe(1);
  expect(app.count("id:thread-reasoning-reason")).toBe(0);
  expect(app.count("id:thread-collapse-reason")).toBe(0);
  expect(app.texts()).toContain("Checking repository status");
  expect(app.texts().some((value) => value.includes("**Checking"))).toBe(false);
  expect(app.spanStyle("text:Checking repository status").fontSize).toBe(13);
});
test("structured reasoning uses small native text, list rows and literal code with controlled collapse", async () => {
  const app = await open("./tests/fixtures/ReasoningHarness.tsx", { width: 800, height: 700 });
  await app.press("id:detail");
  expect(app.count("id:thread-reasoning-reason")).toBe(1);
  expect(app.texts()).toContain("Checking repository status");
  expect(app.texts()).toContain("git diff --stat");
  expect(app.spanStyle("text:Checking repository status").fontSize).toBe(13);
  expect(app.texts().some((value) => value.includes("## Checking"))).toBe(false);
  await app.press("id:thread-collapse-reason");
  expect(app.count("id:thread-reasoning-reason")).toBe(0);
  await app.press("id:thread-toggle-reason");
  expect(app.count("id:thread-reasoning-reason")).toBe(1);
  await app.press("id:theme");
  expect(app.count("id:thread-reasoning-reason")).toBe(1);
});
test("reasoning sections preserve provider content and handle partial streamed formatting", () => {
  const item = (summary: unknown, content?: unknown) => ({
    id: "r",
    type: "reasoning",
    summary,
    content,
  });
  expect(reasoningPresentation(item(["**Checking repository"])).blocks).toEqual([
    { kind: "title", text: "Checking repository" },
  ]);
  expect(reasoningPresentation(item([], ["fallback text"])).compact).toBe(true);
  expect(
    reasoningPresentation(item(["# Heading\n\n1. first\n2. second\n\n```ts\nconst a = 1;"])).blocks,
  ).toEqual([
    { kind: "title", text: "Heading" },
    { kind: "bullet", marker: "1.", text: "first" },
    { kind: "bullet", marker: "2.", text: "second" },
    { kind: "code", text: "const a = 1;" },
  ]);
  expect(reasoningRuns("keep **important** and `x_y` unchanged")).toEqual([
    { kind: "plain", text: "keep " },
    { kind: "strong", text: "important" },
    { kind: "plain", text: " and " },
    { kind: "code", text: "x_y" },
    { kind: "plain", text: " unchanged" },
  ]);
  expect(reasoningPresentation(item(["a".repeat(25000)])).truncated).toBe(true);
});

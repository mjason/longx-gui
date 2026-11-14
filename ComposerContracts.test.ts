import { expect, test } from "nsh/test";
import { attachmentKind } from "./src/api/attachments";
import { modelEfforts, resolvedModel } from "./src/api/composer";
import { composerCompletion } from "./src/features/threads/composerCompletion";
import { snapshot } from "./src/features/threads/threadModel";
import { canRetractTurn } from "./src/features/threads/threadPresentation";
import { composerCatalog } from "./tests/fixtures/composer";
import { threadSnapshot } from "./tests/fixtures/thread";

test("model defaults resolve through thread, project definition and alias fallback without inventing effort levels", () => {
  const data = composerCatalog();
  expect(resolvedModel(data, null).name).toBe("pro");
  expect(resolvedModel(data, "pro").model?.slug).toBe("sol");
  expect(modelEfforts(data, "pro")).toEqual(["low", "medium", "high"]);
  expect(modelEfforts(data, "fast")).toEqual([]);
  data.getThread = null;
  expect(resolvedModel(data, null).name).toBe("pro");
});
test("attachment adapters match Web image, 32KiB text and uploaded-file boundaries", () => {
  expect(attachmentKind({ type: "image/png", size: 40000 })).toBe("image");
  expect(attachmentKind({ type: "text/markdown", size: 32768 })).toBe("text");
  expect(attachmentKind({ type: "text/markdown", size: 32769 })).toBe("upload");
  expect(attachmentKind({ type: "application/pdf", size: 10 })).toBe("upload");
});
test("completion respects the caret and does not mistake email addresses or serialized sessions for mentions", () => {
  expect(composerCompletion("see @main trailing", 9)).toEqual({
    kind: "@",
    query: "main",
    start: 4,
    end: 9,
  });
  expect(composerCompletion("me@example.com", 14)).toBe(null);
  expect(composerCompletion('@session("project:other")', 25)).toBe(null);
  expect(composerCompletion("/goal", 5)?.query).toBe("goal");
});
test("retraction is offered only for an own turn with no answer or tool output", () => {
  const source = threadSnapshot();
  expect(canRetractTurn(snapshot(source, "kernel-t1"))).toBe(false);
  source.items = source.items.slice(0, 1);
  expect(canRetractTurn(snapshot(source, "kernel-t1"))).toBe(true);
});

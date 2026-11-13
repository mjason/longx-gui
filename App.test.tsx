import { expect, open, test } from "nsh/test";

test("starts an empty native application without network requests", async () => {
  const app = await open("./App.tsx");
  expect(app.count("id:app-root")).toBe(1);
  expect(app.requests()).toEqual([]);
});

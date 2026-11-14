import type { StubRequest, StubResponse } from "nsh/test";
import { mockServer } from "./server";

export function viewsServer(request: StubRequest): StubResponse {
  if (new URL(request.url).pathname === "/") {
    return { body: '<meta name="csrf-token" content="fixture-token">' };
  }
  if (new URL(request.url).pathname === "/files/p1/_attachments/preview.png") {
    return {
      headers: { "content-type": "image/svg+xml" },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect width="400" height="100" fill="#dbe4c8"/><circle cx="200" cy="50" r="30" fill="#708336"/></svg>',
    };
  }
  return mockServer(request);
}

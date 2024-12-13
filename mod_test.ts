import { assertEquals, assertExists } from "@std/assert";
import { watchResource } from "./mod.ts";

Deno.test("watchResource function is an async generator", () => {
  const watcher = watchResource("v1", "Pod", "default");
  assertExists(watcher);
  assertEquals(typeof watcher[Symbol.asyncIterator], "function");
});

Deno.test("useResource test react hook with react renderer", async () => {
  const { result, unmount } = renderHook(() => useResource("v1", "Pod", "default"));
  await waitFor(() => expect(result.current).toEqual([]));
  unmount();
});
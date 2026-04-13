import { expect, test, describe, spyOn } from "bun:test";
import { invalidateProjectId } from "../../services/tokenRefresh.ts";

describe("tokenRefresh cache invalidation", () => {
  test("invalidateProjectId deletes from cache", () => {
    const deleteSpy = spyOn(Map.prototype, "delete");

    invalidateProjectId("test-conn-123");

    expect(deleteSpy).toHaveBeenCalledWith("test-conn-123");

    deleteSpy.mockRestore();
  });
});

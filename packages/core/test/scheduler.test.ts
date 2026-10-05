import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startScheduledRefresh } from "../src/scheduler";
import { CatalogStore } from "../src/store";
import type { CatalogSource } from "../src/source";

let store: CatalogStore;

beforeEach(() => {
  vi.useFakeTimers();
  store = new CatalogStore(":memory:");
});

afterEach(() => {
  store.close();
  vi.useRealTimers();
});

describe("startScheduledRefresh", () => {
  it("refreshes the store once per interval tick", async () => {
    const source: CatalogSource = { load: vi.fn(async () => ({ files: [], errors: [] })) };

    const stop = startScheduledRefresh(store, [source], 1000);

    await vi.advanceTimersByTimeAsync(1000);
    expect(source.load).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(source.load).toHaveBeenCalledTimes(3);

    stop();
  });

  it("stops refreshing once the returned stop function is called", async () => {
    const source: CatalogSource = { load: vi.fn(async () => ({ files: [], errors: [] })) };

    const stop = startScheduledRefresh(store, [source], 1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(source.load).toHaveBeenCalledTimes(1);

    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(source.load).toHaveBeenCalledTimes(1);
  });

  it("reports a failed refresh via onError instead of throwing", async () => {
    const source: CatalogSource = {
      load: vi.fn(async () => {
        throw new Error("source unreachable");
      }),
    };
    const onError = vi.fn();

    const stop = startScheduledRefresh(store, [source], 1000, { onError });
    await vi.advanceTimersByTimeAsync(1000);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    stop();
  });
});

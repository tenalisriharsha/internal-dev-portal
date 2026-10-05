import type { CatalogSource } from "./source";
import type { CatalogStore } from "./store";

export interface ScheduledRefreshOptions {
  /** Injectable for tests. Defaults to the global timer functions. */
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  onError?: (err: unknown) => void;
}

/** Starts refreshing the store from `sources` on a fixed interval. Returns a function that stops it. */
export function startScheduledRefresh(
  store: CatalogStore,
  sources: CatalogSource[],
  intervalMs: number,
  options: ScheduledRefreshOptions = {},
): () => void {
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  const onError = options.onError ?? (() => {});

  const handle = setIntervalFn(() => {
    store.refresh(sources).catch(onError);
  }, intervalMs);

  return () => clearIntervalFn(handle);
}

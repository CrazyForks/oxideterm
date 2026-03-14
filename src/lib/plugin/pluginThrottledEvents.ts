/**
 * Plugin Throttled Events
 *
 * Provides a throttled event emitter that limits how frequently
 * high-frequency events (profiler metrics, transfer progress) are
 * pushed to plugin handlers. Prevents performance degradation.
 */

type ThrottledCallback<T> = (data: T) => void;

/**
 * Create a throttled emitter that batches calls within the given interval.
 * Only the latest data within each interval window is delivered.
 *
 * @param intervalMs  Minimum time between handler invocations
 * @param handler     The actual handler to call with the latest data
 * @returns A function to call with new data (will be throttled)
 *          and a dispose function to cancel any pending timer.
 */
export function createThrottledEmitter<T>(
  intervalMs: number,
  handler: ThrottledCallback<T>,
): { push: (data: T) => void; dispose: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastCallTime = 0;
  let pendingData: T | undefined;

  function push(data: T) {
    const now = Date.now();
    const elapsed = now - lastCallTime;

    if (elapsed >= intervalMs) {
      lastCallTime = now;
      try {
        handler(data);
      } catch {
        // Swallow plugin handler errors
      }
    } else {
      pendingData = data;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          lastCallTime = Date.now();
          if (pendingData !== undefined) {
            try {
              handler(pendingData);
            } catch {
              // Swallow plugin handler errors
            }
            pendingData = undefined;
          }
        }, intervalMs - elapsed);
      }
    }
  }

  function dispose() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pendingData = undefined;
  }

  return { push, dispose };
}

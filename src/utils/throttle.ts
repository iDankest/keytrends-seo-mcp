export function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

interface QueuedTask<T> {
  fn: () => Promise<T>;
  resolve: (val: T) => void;
  reject: (err: unknown) => void;
}

export function createLimiter(opts: {
  concurrency: number;
  minIntervalMs: number;
}): <T>(fn: () => Promise<T>) => Promise<T> {
  const { concurrency, minIntervalMs } = opts;
  const queue: QueuedTask<any>[] = [];
  let activeCount = 0;
  let lastDispatchTime = 0;
  let timer: NodeJS.Timeout | null = null;

  function pump() {
    if (queue.length === 0 || activeCount >= concurrency) {
      return;
    }

    const now = Date.now();
    const elapsed = now - lastDispatchTime;
    if (elapsed < minIntervalMs) {
      if (timer === null) {
        timer = setTimeout(() => {
          timer = null;
          pump();
        }, minIntervalMs - elapsed);
      }
      return;
    }

    const task = queue.shift();
    if (!task) return;

    activeCount++;
    lastDispatchTime = Date.now();

    (async () => {
      try {
        const res = await task.fn();
        task.resolve(res);
      } catch (err) {
        task.reject(err);
      } finally {
        activeCount--;
        pump();
      }
    })();

    // Attempt to start next task if concurrency permits
    pump();
  }

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    const { promise, resolve, reject } = Promise.withResolvers<T>();
    queue.push({ fn, resolve, reject });
    pump();
    return promise;
  };
}

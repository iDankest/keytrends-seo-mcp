export function sleep(ms) {
    const { promise, resolve } = Promise.withResolvers();
    setTimeout(resolve, ms);
    return promise;
}
export function createLimiter(opts) {
    const { concurrency, minIntervalMs } = opts;
    const queue = [];
    let activeCount = 0;
    let lastDispatchTime = 0;
    let timer = null;
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
        if (!task)
            return;
        activeCount++;
        lastDispatchTime = Date.now();
        (async () => {
            try {
                const res = await task.fn();
                task.resolve(res);
            }
            catch (err) {
                task.reject(err);
            }
            finally {
                activeCount--;
                pump();
            }
        })();
        // Attempt to start next task if concurrency permits
        pump();
    }
    return function limit(fn) {
        const { promise, resolve, reject } = Promise.withResolvers();
        queue.push({ fn, resolve, reject });
        pump();
        return promise;
    };
}
//# sourceMappingURL=throttle.js.map
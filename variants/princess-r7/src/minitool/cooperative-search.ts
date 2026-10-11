/* 每个候选/路线边界让出主线程；取消会关闭迭代器，不回传过期结果。 */
export async function runSearchSteps<T>(steps: Generator<void, T, void>, cancelled: () => boolean): Promise<T | undefined> {
  try {
    while (!cancelled()) {
      const until = performance.now() + 8;
      do {
        const result = steps.next();
        if (result.done) return cancelled() ? undefined : result.value;
      } while (!cancelled() && performance.now() < until);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    return undefined;
  } finally {
    steps.return(undefined as T);
  }
}

/**
 * Serializes async save operations so "navigate away" never races an in-flight
 * PATCH. Callers await `run()` and are guaranteed prior saves finished first.
 */
export class SaveQueue {
  private chain: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.chain.then(task, task);
    // Keep the chain alive even if a task rejects.
    this.chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

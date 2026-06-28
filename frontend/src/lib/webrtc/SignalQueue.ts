export class SignalQueue {
  private queue: Promise<void> = Promise.resolve();

  public enqueue(task: () => Promise<void>): Promise<void> {
    const next = this.queue.then(task).catch(e => {
      console.error("Signal queue error", e);
    });
    this.queue = next;
    return next;
  }
}

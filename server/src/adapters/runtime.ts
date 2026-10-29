import type { BackgroundRunner, Logger } from "../ports.js";

export class FireAndForgetRunner implements BackgroundRunner {
  constructor(private readonly logger: Logger) {}

  run(label: string, task: () => Promise<void>): void {
    void task().catch((err) => {
      this.logger.error(`${label} — échec inattendu`, {
        err: err instanceof Error ? err.message : err,
      });
    });
  }
}

export class ConsoleLogger implements Logger {
  info(message: string, meta?: Record<string, unknown>): void {
    console.log(message, meta ?? "");
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(message, meta ?? "");
  }
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(message, meta ?? "");
  }
}

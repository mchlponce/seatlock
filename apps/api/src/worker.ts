import "reflect-metadata";
import { INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { workerIntervalMs } from "./database/config";
import { HoldsService } from "./holds/holds.service";
import { PaymentsService } from "./payments/payments.service";
import { WorkerModule } from "./worker.module";

class Worker {
  private stopping = false;
  private wake?: () => void;

  constructor(
    private readonly holds: HoldsService,
    private readonly payments: PaymentsService,
    private readonly intervalMs: number
  ) {}

  async run(): Promise<void> {
    while (!this.stopping) {
      await this.runOnce();
      await this.sleep(this.intervalMs);
    }
  }

  stop(): void {
    this.stopping = true;
    this.wake?.();
  }

  private async runOnce(): Promise<void> {
    try {
      await this.payments.processInbox();
    } catch (error: any) {
      console.error("Processing inbox failed", error.message);
    }

    try {
      await this.holds.expireStaleHolds();
    } catch (error: any) {
      console.error("Expiring stale holds failed", error.message);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const id = setTimeout(resolve, ms);
      this.wake = () => {
        clearTimeout(id);
        resolve();
      };
    });
  }
}

async function bootstrap() {
  const app: INestApplicationContext =
    await NestFactory.createApplicationContext(WorkerModule);
  const worker = new Worker(
    app.get(HoldsService),
    app.get(PaymentsService),
    workerIntervalMs()
  );

  process.on("SIGTERM", () => worker.stop());
  process.on("SIGINT", () => worker.stop());

  await worker.run();
  await app.close();
}

bootstrap();

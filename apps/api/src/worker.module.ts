import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HoldsModule } from './holds/holds.module';
import { PaymentsModule } from './payments/payments.module';

@Module({ imports: [DatabaseModule, HoldsModule, PaymentsModule] })
export class WorkerModule {}

import { Module } from '@nestjs/common';
import { PAYMENT_PROVIDER } from './payment-provider';
import { FakePaymentProvider } from './fake-payment-provider';
import { PaymentsService } from './payments.service';
import { WebhooksController } from './webhooks.controller';

@Module({
  providers: [PaymentsService, { provide: PAYMENT_PROVIDER, useClass: FakePaymentProvider }],
  controllers: [WebhooksController],
  exports: [PaymentsService],
})
export class PaymentsModule {}

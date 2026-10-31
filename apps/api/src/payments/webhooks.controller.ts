import { BadRequestException, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { InvalidWebhookSignatureError } from './payments.errors';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('payments')
  @HttpCode(200)
  async payments_(@Req() req: Request & { rawBody?: Buffer }, @Headers('x-signature') signature?: string) {
    try {
      await this.payments.receiveWebhook(req.rawBody?.toString('utf8') ?? '', signature);
    } catch (err) {
      if (err instanceof InvalidWebhookSignatureError) throw new BadRequestException(err.message);
      throw err;
    }
    return { received: true };
  }
}

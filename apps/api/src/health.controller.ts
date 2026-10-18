import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Target for the ALB health check: healthy only if the DB answers. */
@Controller('health')
export class HealthController {
  constructor(private readonly db: DataSource) {}

  @Get()
  async check() {
    await this.db.query('SELECT 1');
    return { status: 'ok' };
  }
}

import { Module } from '@nestjs/common';
import { HoldsResolver } from './holds.resolver';
import { HoldsService } from './holds.service';

@Module({ providers: [HoldsService, HoldsResolver], exports: [HoldsService] })
export class HoldsModule {}

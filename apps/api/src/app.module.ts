import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseUrl } from './database/config';
import { EventsModule } from './events/events.module';
import { HoldsModule } from './holds/holds.module';
import { PaymentsModule } from './payments/payments.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    // No entities/sync: the schema is owned by SQL migrations, queries are explicit SQL.
    TypeOrmModule.forRoot({ type: 'postgres', url: databaseUrl(), synchronize: false }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      sortSchema: true,
    }),
    EventsModule,
    HoldsModule,
    PaymentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

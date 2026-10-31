import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { databaseUrl, dbSsl } from "./config";

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: "postgres",
      url: databaseUrl(),
      synchronize: false,
      ssl: dbSsl(),
    }),
  ],
})
export class DatabaseModule {}

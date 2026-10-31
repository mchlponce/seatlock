import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors();
  app.enableShutdownHooks(); // finish in-flight requests on SIGTERM during rolling deploys
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API on http://localhost:${port}/graphql`);
}
bootstrap();

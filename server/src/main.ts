import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`API listening on http://0.0.0.0:${port}/api`);
}

bootstrap();

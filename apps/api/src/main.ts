import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { AppConfig } from './config/app-config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  const port = app.get(AppConfig).env.API_PORT;
  await app.listen(port);
  Logger.log(`Lifeline API listening on http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();

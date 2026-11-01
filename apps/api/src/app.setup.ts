import { type NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppConfig } from './config/app-config';

/** Shared by main.ts and the end-to-end tests so both run the same HTTP pipeline. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(AppConfig);
  app.setGlobalPrefix('api');
  // The web app proxies /api through Next.js on the same host, so trust loopback for client IPs.
  app.set('trust proxy', 'loopback');
  app.use(helmet());
  app.use(cookieParser());
  // A crew app returning from a long offline stretch uploads its whole queue in one request.
  app.useBodyParser('json', { limit: '1mb' });
  app.enableCors({ origin: config.env.WEB_ORIGIN, credentials: true });
  app.enableShutdownHooks();
}

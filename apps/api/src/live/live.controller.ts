import { Controller, Get, Req, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { type Request, type Response } from 'express';
import { filter } from 'rxjs';
import { Auth, AuthContext } from '../auth/auth-context';
import { PrismaService } from '../prisma/prisma.service';
import { transferAccess } from '../transport/transfer-access';
import { LiveService } from './live.service';

const HEARTBEAT_MS = 25_000;
const SESSION_CHECK_MS = 60_000;

@Controller('live')
export class LiveController {
  constructor(
    private readonly live: LiveService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Server-Sent Events: one long-lived response per signed-in tab. Each event goes only to people who
   * may see that transfer. Browsers reconnect by themselves if the connection drops.
   */
  @Get()
  @SkipThrottle()
  stream(@Auth() auth: AuthContext, @Req() req: Request, @Res() res: Response): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform stops proxies (including the web app's) from compressing and buffering events.
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 5000\n\n');
    res.write(`event: ready\ndata: {}\n\n`);

    const subscription = this.live.events
      .pipe(filter(({ scope }) => transferAccess(auth, scope).canView))
      .subscribe(({ event }) => {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      });

    // Comments keep idle connections open through proxies and mobile networks.
    const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), HEARTBEAT_MS);
    // A signed-out or revoked session stops receiving updates within a minute.
    const sessionCheck = setInterval(() => {
      void this.prisma.session
        .findUnique({ where: { id: auth.sessionId }, select: { revokedAt: true, expiresAt: true } })
        .then((s) => {
          if (!s || s.revokedAt || s.expiresAt <= new Date()) res.end();
        });
    }, SESSION_CHECK_MS);

    const close = () => {
      subscription.unsubscribe();
      clearInterval(heartbeat);
      clearInterval(sessionCheck);
    };
    req.on('close', close);
    res.on('close', close);
  }
}

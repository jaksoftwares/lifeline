import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config';

const POSTMARK_EMAIL_URL = 'https://api.postmarkapp.com/email';

export class PostmarkSendError extends Error {}

@Injectable()
export class PostmarkEmailService {
  constructor(private readonly config: AppConfig) {}

  get isConfigured(): boolean {
    return Boolean(this.config.env.POSTMARK_SERVER_TOKEN && this.config.env.POSTMARK_FROM_EMAIL);
  }

  async send(input: { to: string; subject: string; textBody: string }): Promise<void> {
    const { POSTMARK_SERVER_TOKEN, POSTMARK_FROM_EMAIL, POSTMARK_MESSAGE_STREAM } = this.config.env;
    if (!POSTMARK_SERVER_TOKEN || !POSTMARK_FROM_EMAIL)
      throw new Error('Postmark email is not configured.');

    const response = await fetch(POSTMARK_EMAIL_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': POSTMARK_SERVER_TOKEN,
      },
      body: JSON.stringify({
        From: POSTMARK_FROM_EMAIL,
        To: input.to,
        Subject: input.subject.replace(/[\r\n]+/g, ' ').slice(0, 200),
        TextBody: input.textBody,
        MessageStream: POSTMARK_MESSAGE_STREAM,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const responseText = await response.text();
    let responseBody: unknown;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      throw new PostmarkSendError(
        `Postmark returned an invalid response (HTTP ${response.status}).`,
      );
    }

    const errorCode = postmarkErrorCode(responseBody);
    if (!response.ok || errorCode !== 0) {
      throw new PostmarkSendError(
        `Postmark rejected the email (HTTP ${response.status}, error ${errorCode ?? 'unknown'}).`,
      );
    }
  }
}

function postmarkErrorCode(value: unknown): number | null {
  if (typeof value !== 'object' || value === null || !('ErrorCode' in value)) return null;
  return typeof value.ErrorCode === 'number' ? value.ErrorCode : null;
}

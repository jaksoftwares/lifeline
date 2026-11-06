import 'server-only';

// Email through Postmark. Sending never blocks or breaks the action that triggered it:
// callers schedule it with next/server `after()`, and failures are only logged.

const FROM = process.env.EMAIL_FROM ?? 'Afyaline <notifications@dovepeakdigital.com>';

/** The public address of the app, for links in emails. */
export const appUrl = () =>
  process.env.APP_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000');

/** Demo and test addresses (e.g. the seeded @afyaline.example accounts) never receive mail. */
const deliverable = (email: string) => !/\.(example|test|invalid|localhost)$/i.test(email.trim());

export interface Email {
  to: string;
  subject: string;
  heading: string;
  lines: string[];
  action?: { label: string; href: string };
}

const escape = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function html({ heading, lines, action }: Email) {
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f1f1d">
<div style="max-width:520px;margin:0 auto;padding:24px">
  <div style="font-size:20px;font-weight:bold;margin-bottom:16px">Afya<span style="color:#0d8a76">line</span></div>
  <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e2e8f0">
    <h1 style="font-size:18px;margin:0 0 12px">${escape(heading)}</h1>
    ${lines.map((l) => `<p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:#334155">${escape(l)}</p>`).join('')}
    ${
      action
        ? `<a href="${escape(action.href)}" style="display:inline-block;margin-top:12px;background:#0d8a76;color:#fff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 20px;border-radius:8px">${escape(action.label)}</a>`
        : ''
    }
  </div>
  <p style="font-size:12px;color:#64748b;margin-top:16px">You receive this because your organization uses Afyaline for patient transfers. Patient details are only shown after signing in.</p>
</div></body></html>`;
}

const text = ({ heading, lines, action }: Email) =>
  [heading, '', ...lines, ...(action ? ['', `${action.label}: ${action.href}`] : [])].join('\n');

/** Sends each email separately (recipients never see each other). */
export async function sendEmails(emails: Email[]) {
  const token = process.env.POSTMARK_API_TOKEN;
  const batch = emails.filter((e) => deliverable(e.to));
  if (!token || !batch.length) return;
  try {
    const res = await fetch('https://api.postmarkapp.com/email/batch', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': token,
      },
      body: JSON.stringify(
        batch.map((e) => ({
          From: FROM,
          To: e.to,
          Subject: e.subject,
          HtmlBody: html(e),
          TextBody: text(e),
          MessageStream: 'outbound',
          Tag: 'afyaline',
        })),
      ),
      signal: AbortSignal.timeout(10_000),
    });
    const results = (await res.json()) as { ErrorCode: number; Message: string; To?: string }[];
    for (const r of Array.isArray(results) ? results : [results]) {
      if (r.ErrorCode) console.error('email not sent', r.To, r.ErrorCode, r.Message);
    }
  } catch (error) {
    console.error('email service unavailable', error);
  }
}

/** The Afyaline team (ADMIN_EMAILS, comma-separated). */
export const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Twilio REST and webhook helpers, implemented directly against the documented
 * HTTP surface rather than through the SDK.
 *
 * Two reasons: the SDK is a large CommonJS dependency for two endpoints, and
 * the signature algorithm is short, well-specified and worth having in plain
 * sight in a codebase where the phone path is explicitly marked as unprovisioned.
 */

/**
 * Validates `X-Twilio-Signature`: base64 HMAC-SHA1 over the full request URL
 * with every POST parameter appended in sorted key order.
 */
export function validateTwilioSignature(
  authToken: string,
  signature: string | undefined,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!signature) return false;

  const payload = Object.keys(params)
    .sort()
    .reduce((accumulator, key) => accumulator + key + params[key], url);

  const expected = createHmac('sha1', authToken).update(Buffer.from(payload, 'utf8')).digest('base64');

  const provided = Buffer.from(signature);
  const computed = Buffer.from(expected);
  return provided.length === computed.length && timingSafeEqual(provided, computed);
}

export interface OutboundCallRequest {
  accountSid: string;
  authToken: string;
  to: string;
  from: string;
  /** Webhook Twilio fetches for TwiML once the call connects. */
  answerUrl: string;
  statusCallbackUrl?: string;
}

export interface OutboundCallResult {
  sid: string;
  status: string;
}

export async function createOutboundCall(request: OutboundCallRequest): Promise<OutboundCallResult> {
  const body = new URLSearchParams({
    To: request.to,
    From: request.from,
    Url: request.answerUrl,
    Method: 'POST',
  });
  if (request.statusCallbackUrl) body.set('StatusCallback', request.statusCallbackUrl);

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${request.accountSid}/Calls.json`,
    {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${request.accountSid}:${request.authToken}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
    },
  );

  const payload = (await response.json()) as { sid?: string; status?: string; message?: string };
  if (!response.ok) {
    throw new Error(payload.message ?? `Twilio responded ${response.status}`);
  }
  return { sid: payload.sid ?? '', status: payload.status ?? 'unknown' };
}

/**
 * `<Connect><Stream>` opens a bidirectional media stream, which is what lets the
 * agent speak back. `<Start><Stream>` would only fork inbound audio.
 */
export function buildStreamTwiml(streamUrl: string, languageMode: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    '  <Connect>',
    `    <Stream url="${escapeXml(streamUrl)}">`,
    `      <Parameter name="languageMode" value="${escapeXml(languageMode)}" />`,
    '    </Stream>',
    '  </Connect>',
    '</Response>',
  ].join('\n');
}

export function buildRejectTwiml(message: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    `  <Say>${escapeXml(message)}</Say>`,
    '  <Hangup/>',
    '</Response>',
  ].join('\n');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

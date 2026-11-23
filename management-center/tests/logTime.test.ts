import { describe, expect, test } from 'bun:test';
import {
  logInstant,
  parseErrorLogName,
  parseWallClock,
  requestLogStatus,
  responseErrorMessage,
  responseSectionStart,
  serverUtcOffset,
} from '../src/features/logs/model/logTime';

describe('log times', () => {
  test('keeps the server clock reading instead of shifting time zones', () => {
    const date = parseWallClock('2026-11-23 03:13:12.456');
    expect(date && [date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()]).toEqual(
      [23, 3, 13, 12]
    );
    expect(parseWallClock('2026-11-23')?.getDate()).toBe(23);
    expect(parseWallClock('not a time')).toBeNull();
  });

  test('reads endpoint, time and request id from error log names', () => {
    const parsed = parseErrorLogName('error-v1-messages-2026-11-23T031312-60415aa2.log');
    expect(parsed?.endpoint).toBe('v1-messages');
    expect(parsed?.requestId).toBe('60415aa2');
    expect(parsed?.time).toBe('2026-11-23T031312');
    // The server adds a sequence number when two requests share a name.
    expect(parseErrorLogName('error-api-hello-2026-11-22T224359-2-6416.log')?.endpoint).toBe(
      'api-hello'
    );
    expect(parseErrorLogName('request-60415aa2.log')).toBeNull();
  });

  test('prefers the status sent to the client over the upstream error status', () => {
    const text = '=== API ERROR RESPONSE ===\nHTTP Status: 429\n\n=== RESPONSE ===\nStatus: 499\n';
    expect(requestLogStatus(text)).toBe(499);
    expect(requestLogStatus('=== API ERROR RESPONSE ===\nHTTP Status: 502\n')).toBe(502);
    expect(requestLogStatus('no status here')).toBeNull();
  });

  test('finds the first response section after the request body', () => {
    const text = '=== REQUEST BODY ===\n{}\n\n=== API ERROR RESPONSE ===\nHTTP Status: 403\n';
    expect(responseSectionStart(text)).toBe(text.indexOf('=== API ERROR'));
    expect(responseSectionStart('=== REQUEST BODY ===\nRESPONSE ===\n')).toBeNull();
  });

  test('learns the server offset from its newest line and the reported Unix time', () => {
    const lines = [
      '[2026-11-23 21:42:19] [a] [info ] [gin_logger.go:113] 200 | 28ms | GET "/v1/models"',
      '    continuation line',
      '[2026-11-23 21:42:20] [b] [info ] [gin_logger.go:113] 200 | 28ms | GET "/v1/models"',
    ];
    // 21:42:20 at +08:00 is 13:42:20 UTC.
    const latest = Date.UTC(2026, 10, 23, 13, 42, 20) / 1000;
    expect(serverUtcOffset(lines, latest)).toBe(480);
    expect(serverUtcOffset(lines, undefined)).toBeNull();
    expect(serverUtcOffset([], latest)).toBeNull();
    // A Unix time from some other moment never yields an offset.
    expect(serverUtcOffset(lines, latest - 7)).toBeNull();
    expect(serverUtcOffset(lines, latest - 20 * 3600)).toBeNull();
  });

  test('turns a server clock reading into the real instant once the offset is known', () => {
    expect(logInstant('2026-11-23 21:42:20', 480)?.toISOString()).toBe('2026-11-23T13:42:20.000Z');
    expect(logInstant('2026-11-23T031312', -300)?.toISOString()).toBe('2026-11-23T08:13:12.000Z');
    expect(logInstant('2026-11-23 21:42:20', null)?.getHours()).toBe(21);
  });

  test('reads the error message from the response body', () => {
    const body =
      '{"type":"error","error":{"type":"permission_error","message":"model not allowed"}}';
    const text = `=== REQUEST BODY ===\n{"message":"user prompt"}\n\n=== API ERROR RESPONSE ===\n${body}\n`;
    expect(responseErrorMessage(text)).toBe('model not allowed');
    expect(responseErrorMessage('=== RESPONSE ===\nStatus: 500\n{"message":"boom"}\n')).toBe(
      'boom'
    );
    expect(responseErrorMessage('=== RESPONSE ===\nStatus: 200\n{"id":"x"}\n')).toBeNull();
  });
});

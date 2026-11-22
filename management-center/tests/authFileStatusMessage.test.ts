import { describe, expect, test } from 'bun:test';
import { describeAuthFileStatusMessage } from '../src/features/authFiles/constants';

describe('describeAuthFileStatusMessage', () => {
  test('reads an Anthropic error body', () => {
    const raw =
      '{"type":"error","error":{"type":"rate_limit_error","message":"This request would exceed your account\'s rate limit. Please try again later."},"request_id":"req_1"}';
    expect(describeAuthFileStatusMessage(raw)).toEqual({
      kind: 'Rate limit',
      message: "This request would exceed your account's rate limit. Please try again later.",
    });
  });

  test('reads a Google error body after an HTTP status', () => {
    const raw =
      '429 Too Many Requests: [{"error":{"code":429,"message":"Quota exceeded.","status":"RESOURCE_EXHAUSTED"}}]';
    expect(describeAuthFileStatusMessage(raw)).toEqual({
      kind: 'Resource exhausted',
      message: 'Quota exceeded.',
    });
  });

  test('falls back to the HTTP status when the body has no error type', () => {
    expect(describeAuthFileStatusMessage('401 Unauthorized: {"detail":"Token expired"}')).toEqual({
      kind: '401 Unauthorized',
      message: 'Token expired',
    });
  });

  test('leaves plain text and broken JSON untouched', () => {
    expect(describeAuthFileStatusMessage('token refresh failed')).toEqual({
      message: 'token refresh failed',
    });
    expect(describeAuthFileStatusMessage('{"error": {"message": "cut off')).toEqual({
      message: '{"error": {"message": "cut off',
    });
  });
});

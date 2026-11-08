import { createMockActionContext } from '@activepieces/pieces-framework';
import { HttpError, httpClient } from '@activepieces/pieces-common';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { corbitSmsCommon } from '../src/lib/common';
import { sendSmsAction } from '../src/lib/actions/send-sms';
import { sendBulkSmsAction } from '../src/lib/actions/send-bulk-sms';
import { getMessageStatusAction } from '../src/lib/actions/get-message-status';
import { getDeliveryReportAction } from '../src/lib/actions/get-delivery-report';
import { getBalanceAction } from '../src/lib/actions/get-balance';
import { listSenderNamesAction } from '../src/lib/actions/list-sender-names';
import { corbitSms } from '../src';

function withAuth<T extends object>(propsValue: T) {
  return { ...createMockActionContext({ propsValue }), auth: { type: 'SECRET_TEXT', secret_text: 'test-token' } };
}

function mockResponses(...bodies: unknown[]) {
  const spy = vi.spyOn(httpClient, 'sendRequest');
  bodies.forEach((body) => {
    if (body instanceof Error) {
      spy.mockRejectedValueOnce(body);
    } else {
      spy.mockResolvedValueOnce({ status: 200, headers: {}, body });
    }
  });
  return spy;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('phone numbers, read like the Corbit SMS app', () => {
  test('accepts international, Saudi local, Arabic digits and +966 (0)', () => {
    expect(corbitSmsCommon.normalizeNumber('+966 50 123 4567')).toBe('966501234567');
    expect(corbitSmsCommon.normalizeNumber('0501234567')).toBe('966501234567');
    expect(corbitSmsCommon.normalizeNumber('501234567')).toBe('966501234567');
    expect(corbitSmsCommon.normalizeNumber('00966501234567')).toBe('966501234567');
    expect(corbitSmsCommon.normalizeNumber('+966 (0) 50 123 4567')).toBe('966501234567');
    expect(corbitSmsCommon.normalizeNumber('٠٥٠١٢٣٤٥٦٧')).toBe('966501234567');
    expect(corbitSmsCommon.normalizeNumber('+20 100 123 4567')).toBe('201001234567');
    expect(corbitSmsCommon.normalizeNumber(966501234567)).toBe('966501234567');
  });

  test('rejects anything that could become a wrong number', () => {
    ['9.66501E+11', '966501234567.0', '+966 50 123 4567 ext 12', 966501234567.5, '01001234567', '+0501234567', '', null, {}].forEach(
      (bad) => expect(corbitSmsCommon.normalizeNumber(bad)).toBeUndefined()
    );
  });

  test('splits lists on Arabic commas, tabs and spaces, keeps spaced numbers whole', () => {
    expect(corbitSmsCommon.splitNumbers('0501234567، 0551234567؛0561234567')).toEqual(['0501234567', '0551234567', '0561234567']);
    expect(corbitSmsCommon.splitNumbers('0501234567\t0551234567')).toEqual(['0501234567', '0551234567']);
    expect(corbitSmsCommon.splitNumbers('0501234567 0509876543')).toEqual(['0501234567', '0509876543']);
    expect(corbitSmsCommon.splitNumbers('+966 50 123 4567, 05 0987 6543')).toEqual(['+966501234567', '0509876543']);
    expect(corbitSmsCommon.parseNumbers('0501234567، +966 50 123 4567, x')).toEqual({ numbers: ['966501234567'], invalid: ['x'] });
  });

  test('reads a list that a mapped field turned into JSON text', () => {
    expect(corbitSmsCommon.parseNumbers('["966501234567","0551234567"]')).toEqual({ numbers: ['966501234567', '966551234567'], invalid: [] });
    expect(corbitSmsCommon.parseNumbers('[966501234567]')).toEqual({ numbers: ['966501234567'], invalid: [] });
    expect(corbitSmsCommon.parseNumbers('[not json')).toEqual({ numbers: [], invalid: ['[not', 'json'] });
  });

  test('rejects Saudi mobile numbers of the wrong length', () => {
    expect(corbitSmsCommon.normalizeNumber('9665012345678')).toBeUndefined();
    expect(corbitSmsCommon.normalizeNumber('96650123456')).toBeUndefined();
  });
});

describe('send SMS', () => {
  test('sends the documented body with the token, key and duplicate flag', async () => {
    const spy = mockResponses({ status: 'Success', data: { message: { id: 'm1', status: 'pending' } } });
    const result = await sendSmsAction.run(
      withAuth({ senderName: ' OT.SA ', to: '0501234567', message: 4821, allowDuplicate: true, deduplicationKey: 'order-77' })
    );
    expect(result).toEqual({ message_id: 'm1', status: 'pending', to: '966501234567', sender_name: 'OT.SA' });
    const request = spy.mock.calls[0][0];
    expect(request.redactBodyInErrors).toBe(true);
    expect(request.url).toBe('https://api.corbit.sa/api/v1/send');
    expect(request.headers).toMatchObject({ Authorization: 'Bearer test-token', 'Idempotency-Key': 'order-77', 'X-Allow-Duplicate': 'true' });
    expect(request.body).toEqual({ senderName: 'OT.SA', number: '966501234567', messageBody: '4821', sendAtOption: 'NOW' });
  });

  test('stops before any request when an input is wrong', async () => {
    const spy = vi.spyOn(httpClient, 'sendRequest');
    await expect(sendSmsAction.run(withAuth({ senderName: 'A', to: '01001234567', message: 'x' }))).rejects.toThrow('not a valid mobile number');
    await expect(sendSmsAction.run(withAuth({ senderName: '', to: '966501234567', message: 'x' }))).rejects.toThrow('Choose a Sender Name');
    await expect(sendSmsAction.run(withAuth({ senderName: 'A', to: '966501234567', message: '  ' }))).rejects.toThrow('Message is empty');
    await expect(sendSmsAction.run(withAuth({ senderName: 'A', to: '966501234567', message: 'x'.repeat(1601) }))).rejects.toThrow('1601 characters');
    await expect(sendSmsAction.run(withAuth({ senderName: 'A', to: '966501234567', message: 'x', deduplicationKey: 'طلب' }))).rejects.toThrow('Deduplication Key');
    expect(spy).not.toHaveBeenCalled();
  });

  test('turns API errors into clear messages with a hint', async () => {
    mockResponses(
      new HttpError({}, { status: 402, responseBody: { status: 'Error', message: 'Insufficient balance (0).', code: 'INSUFFICIENT_BALANCE' } }),
      new HttpError({}, { status: 401, responseBody: { message: 'Unauthenticated.' } }),
      new HttpError({}, { status: 409, responseBody: { status: 'Error', message: 'Duplicate request blocked', code: 'DUPLICATE' } }),
      { status: 'Error', message: 'Sender not approved' },
      new HttpError({}, { status: 400, responseBody: { message: 'Odd', code: 'SOMETHING_NEW' } }),
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
      new HttpError({}, { status: 504, responseBody: '<html>Gateway Timeout</html>' }),
      new TypeError('fetch failed')
    );
    const send = () => sendSmsAction.run(withAuth({ senderName: 'A', to: '966501234567', message: 'x' }));
    await expect(send()).rejects.toThrow('Insufficient balance (0). Your Corbit SMS balance is not enough');
    await expect(send()).rejects.toThrow('The API token was rejected');
    await expect(send()).rejects.toThrow('Turn on Allow Duplicate');
    await expect(send()).rejects.toThrow('Sender not approved');
    await expect(send()).rejects.toThrow('Corbit SMS code: SOMETHING_NEW');
    await expect(send()).rejects.toThrow('The SMS may have been sent');
    await expect(send()).rejects.toThrow('Corbit SMS returned HTTP 504 The SMS may have been sent');
    await expect(send()).rejects.toThrow('Could not reach Corbit SMS. The SMS may have been sent');
  });

  test('a read that fails to connect does not mention sending', async () => {
    mockResponses(new TypeError('fetch failed'));
    await expect(getBalanceAction.run(withAuth({}))).rejects.toThrow('Could not reach Corbit SMS. Check the internet connection');
  });

  test('the sender list shows a clear placeholder instead of an error', async () => {
    mockResponses(new HttpError({}, { status: 401, responseBody: { message: 'Unauthenticated.' } }));
    const dropdown = corbitSmsCommon.senderNameDropdown();
    const result = await dropdown.options({ auth: { type: 'SECRET_TEXT', secret_text: 'bad' } }, createMockActionContext({ propsValue: {} }));
    expect(result).toMatchObject({ disabled: true, placeholder: expect.stringContaining('Could not load sender names') });
  });

  test('rejects a token with a line break without sending it anywhere', async () => {
    const spy = vi.spyOn(httpClient, 'sendRequest');
    const context = { ...withAuth({ senderName: 'A', to: '966501234567', message: 'x' }), auth: { type: 'SECRET_TEXT', secret_text: 'abc\nSECRET' } };
    await expect(sendSmsAction.run(context)).rejects.toThrow('line breaks');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('send to many numbers', () => {
  test('sends one request to unique normalised numbers', async () => {
    const spy = mockResponses({ status: 'Success', data: { message: { id: 'b1', status: 'pending' } } });
    const result = await sendBulkSmsAction.run(withAuth({ senderName: 'A', numbers: '0501234567، +966 50 123 4567\n0551234567', message: 'hi' }));
    expect(result).toEqual({ message_id: 'b1', status: 'pending', recipients: 2, numbers: '966501234567, 966551234567', sender_name: 'A' });
    expect(spy.mock.calls[0][0].body).toEqual({ senderName: 'A', numbers: ['966501234567', '966551234567'], messageBody: 'hi', sendAtOption: 'Now' });
  });

  test('sends nothing when any number is invalid', async () => {
    const spy = vi.spyOn(httpClient, 'sendRequest');
    await expect(sendBulkSmsAction.run(withAuth({ senderName: 'A', numbers: '966501234567, 9.66501E+11', message: 'hi' }))).rejects.toThrow('9.66501E+11');
    await expect(sendBulkSmsAction.run(withAuth({ senderName: 'A', numbers: ' , ', message: 'hi' }))).rejects.toThrow('Numbers is empty');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('read actions', () => {
  test('status, report, balance and sender names return flat, table-ready output', async () => {
    const spy = mockResponses(
      { status: 'Success', data: { status: 'sent' } },
      { jobId: 'j0', msgs: [] },
      { jobId: 'j1', msgs: [{ destAddress: '966501234567', status: 'delivered', accepted: true }, { destAddress: '966551234567', status: 'failed' }] },
      { status: 'Success', data: { balance: 631 } },
      { status: 'Success', data: [{ name: 'B', status: 'Approved' }, { name: 'P', status: 'pending' }], pagination: { total: 2, per_page: 50, current_page: 1 } }
    );
    expect(await getMessageStatusAction.run(withAuth({ messageId: ' m/1 ' }))).toEqual({ message_id: 'm/1', status: 'sent' });
    expect(spy.mock.calls[0][0].url).toBe('https://api.corbit.sa/api/v1/message-status/m%2F1');
    expect(await getDeliveryReportAction.run(withAuth({ messageId: 'm0' }))).toEqual([{ message_id: 'm0', job_id: 'j0', number: null, status: null, accepted: null }]);
    expect(await getDeliveryReportAction.run(withAuth({ messageId: 'm2' }))).toEqual([
      { message_id: 'm2', job_id: 'j1', number: '966501234567', status: 'delivered', accepted: true },
      { message_id: 'm2', job_id: 'j1', number: '966551234567', status: 'failed', accepted: null },
    ]);
    expect(await getBalanceAction.run(withAuth({}))).toEqual({ balance: 631 });
    expect(await listSenderNamesAction.run(withAuth({ status: 'approved' }))).toEqual([{ name: 'B', status: 'approved' }]);
  });

  test('sender names stop when the API repeats the same page', async () => {
    const page = { status: 'Success', data: [{ name: 'A', status: 'approved' }], pagination: { total: 500, per_page: 1, current_page: 1 } };
    const spy = mockResponses(page, page);
    expect(await corbitSmsCommon.listSenderNames({ token: 't' })).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('empty message ID is caught before any request', async () => {
    const spy = vi.spyOn(httpClient, 'sendRequest');
    await expect(getMessageStatusAction.run(withAuth({ messageId: ' ' }))).rejects.toThrow('Message ID is empty');
    await expect(getDeliveryReportAction.run(withAuth({ messageId: '' }))).rejects.toThrow('Message ID is empty');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('piece definition', () => {
  test('every action carries the AI metadata Activepieces requires', () => {
    const actions = Object.values(corbitSms.actions()).filter((action) => action.name !== 'custom_api_call');
    expect(actions.map((action) => action.name).sort()).toEqual(
      ['get_balance', 'get_delivery_report', 'get_message_status', 'list_sender_names', 'send_bulk_sms', 'send_sms']
    );
    actions.forEach((action) => {
      expect(action.audience).toBe('both');
      expect(action.aiMetadata?.description?.length).toBeGreaterThan(40);
      expect(['READ', 'SEARCH', 'WRITE']).toContain(action.classification);
    });
  });
});

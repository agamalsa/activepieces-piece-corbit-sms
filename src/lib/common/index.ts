import { HttpError, HttpMethod, httpClient } from '@activepieces/pieces-common';
import { Property } from '@activepieces/pieces-framework';
import { corbitSmsAuth } from '../auth';

async function callApi<T>({
  token,
  method,
  path,
  body,
  queryParams,
  headers,
  sends = false,
}: CallApiParams): Promise<T> {
  const cleanToken = checkToken(token);
  try {
    const response = await httpClient.sendRequest<T>({
      method,
      url: `${CORBIT_BASE_URL}${path}`,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${cleanToken}`,
        ...(headers ?? {}),
      },
      body,
      queryParams,
      timeout: REQUEST_TIMEOUT_MS,
      redactBodyInErrors: true,
    });
    const responseBody = response.body;
    if (isRecord(responseBody) && responseBody['status'] === 'Error') {
      throw new CorbitApiError(describeApiError({ status: response.status, body: responseBody }));
    }
    return responseBody;
  } catch (error) {
    throw toFriendlyError({ error, sends });
  }
}

function normalizeNumber(raw: unknown): string | undefined {
  const text = toNumberText(raw);
  if (text === undefined || !ALLOWED_NUMBER.test(text)) {
    return undefined;
  }
  const digits = toInternationalDigits({ text, digits: text.replace(/\D/g, '') });
  if (digits === undefined) {
    return undefined;
  }
  const withoutTrunkZero = /^9660\d{9}$/.test(digits) ? `966${digits.slice(4)}` : digits;
  if (withoutTrunkZero.startsWith('9665') && !/^9665\d{8}$/.test(withoutTrunkZero)) {
    return undefined;
  }
  return /^[1-9]\d{7,14}$/.test(withoutTrunkZero) ? withoutTrunkZero : undefined;
}

function splitNumbers(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => splitNumbers(item));
  }
  if (value === null || value === undefined) {
    return [];
  }
  if (typeof value === 'number') {
    return [String(value)];
  }
  const text = String(value).trim();
  const jsonList = parseJsonList(text);
  if (jsonList !== undefined) {
    return splitNumbers(jsonList);
  }
  return text
    .split(LIST_SEPARATORS)
    .map((piece) => piece.trim())
    .filter((piece) => piece !== '')
    .flatMap((piece) => splitPiece(piece));
}

function parseNumbers(value: unknown): { numbers: string[]; invalid: string[] } {
  const tokens = splitNumbers(value);
  const invalid = tokens.filter((token) => normalizeNumber(token) === undefined).map((token) => token.slice(0, 40));
  const numbers = [
    ...new Set(
      tokens.map((token) => normalizeNumber(token)).filter((number): number is string => number !== undefined)
    ),
  ];
  return { numbers, invalid };
}

function checkMessage(raw: unknown): string {
  const message = raw === null || raw === undefined ? '' : String(raw);
  if (message.trim() === '') {
    throw new Error('Message is empty. Enter the text of the SMS.');
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message is ${message.length} characters; the limit is ${MAX_MESSAGE_LENGTH}.`);
  }
  return message;
}

function checkSenderName(raw: unknown): string {
  const sender = typeof raw === 'string' ? raw.trim() : '';
  if (sender === '') {
    throw new Error('Choose a Sender Name. It must be approved on your Corbit SMS account.');
  }
  return sender;
}

function sendHeaders({ deduplicationKey, allowDuplicate }: SendHeadersParams): Record<string, string> {
  const key = typeof deduplicationKey === 'string' ? deduplicationKey.trim() : '';
  if (key.length > MAX_DEDUPLICATION_KEY_LENGTH || (key !== '' && !/^[\x20-\x7e]+$/.test(key))) {
    throw new Error(
      `Deduplication Key must be up to ${MAX_DEDUPLICATION_KEY_LENGTH} English letters, digits or symbols.`
    );
  }
  return {
    ...(key !== '' ? { 'Idempotency-Key': key } : {}),
    ...(allowDuplicate === true ? { 'X-Allow-Duplicate': 'true' } : {}),
  };
}

async function listSenderNames({ token }: { token: string }): Promise<SenderName[]> {
  return readSenderPages({ token, page: 1, collected: [], previousFirst: undefined });
}

function senderNameDropdown() {
  return Property.Dropdown({
    displayName: 'Sender Name',
    description:
      'The approved sender name the SMS is sent from. Only sender names approved on your Corbit SMS account are listed.',
    auth: corbitSmsAuth,
    refreshers: [],
    required: true,
    options: async ({ auth }) => {
      if (!auth) {
        return { disabled: true, options: [], placeholder: 'Connect your Corbit SMS account first' };
      }
      try {
        const senders = await listSenderNames({ token: auth.secret_text });
        const approved = [
          ...new Set(
            senders
              .filter((sender) => String(sender.status).toLowerCase() === 'approved')
              .map((sender) => String(sender.name))
          ),
        ].sort((a, b) => a.localeCompare(b));
        return {
          disabled: false,
          options: approved.map((name) => ({ label: name, value: name })),
          placeholder: approved.length === 0 ? 'No approved sender names on this account yet' : 'Choose a sender name',
        };
      } catch {
        return {
          disabled: true,
          options: [],
          placeholder: 'Could not load sender names. Check your Corbit SMS connection.',
        };
      }
    },
  });
}

async function readSenderPages({ token, page, collected, previousFirst }: ReadSenderPagesParams): Promise<SenderName[]> {
  if (page > MAX_SENDER_PAGES) {
    return collected;
  }
  const response = await callApi<SenderNamesResponse>({
    token,
    method: HttpMethod.GET,
    path: '/api/v1/sendernames',
    queryParams: { per_page: String(SENDER_PAGE_SIZE), page: String(page) },
  });
  const items = Array.isArray(response.data) ? response.data : [];
  const first = items.length > 0 ? JSON.stringify(items[0]) : undefined;
  if (items.length === 0 || (page > 1 && first === previousFirst)) {
    return collected;
  }
  const all = [...collected, ...items];
  const total = Number(response.pagination?.total);
  const currentPage = Number(response.pagination?.current_page);
  const pageSize = Number(response.pagination?.per_page) || SENDER_PAGE_SIZE;
  const reachedEnd =
    (Number.isFinite(total) && all.length >= total) ||
    (!Number.isFinite(total) && items.length < pageSize) ||
    (Number.isFinite(currentPage) && currentPage !== page);
  if (reachedEnd) {
    return all;
  }
  return readSenderPages({ token, page: page + 1, collected: all, previousFirst: first });
}

function toFriendlyError({ error, sends }: { error: unknown; sends: boolean }): Error {
  if (error instanceof CorbitApiError) {
    return error;
  }
  if (error instanceof HttpError) {
    const message = describeApiError({ status: error.response.status, body: error.response.body });
    return new Error(sends && error.response.status >= 500 ? `${message} ${MAYBE_SENT_HINT}` : message);
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return new Error(
      sends
        ? `Corbit SMS did not reply within 30 seconds. ${MAYBE_SENT_HINT}`
        : 'Corbit SMS did not reply within 30 seconds. Try again later.'
    );
  }
  return new Error(
    sends
      ? `Could not reach Corbit SMS. ${MAYBE_SENT_HINT}`
      : 'Could not reach Corbit SMS. Check the internet connection and try again.'
  );
}

function parseJsonList(text: string): unknown[] | undefined {
  if (!text.startsWith('[')) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function toNumberText(raw: unknown): string | undefined {
  if (typeof raw === 'number') {
    return Number.isSafeInteger(raw) && raw > 0 ? String(raw) : undefined;
  }
  if (typeof raw !== 'string') {
    return undefined;
  }
  return raw
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

function toInternationalDigits({ text, digits }: { text: string; digits: string }): string | undefined {
  if (text.startsWith('+')) {
    return digits;
  }
  if (digits.startsWith('00')) {
    return digits.slice(2);
  }
  if (/^05\d{8}$/.test(digits)) {
    return `966${digits.slice(1)}`;
  }
  if (/^5\d{8}$/.test(digits)) {
    return `966${digits}`;
  }
  return digits.startsWith('0') ? undefined : digits;
}

function splitPiece(piece: string): string[] {
  if (SPACED_NUMBER.test(piece)) {
    const joined = piece.replace(/\s+/g, '');
    if (normalizeNumber(joined) !== undefined) {
      return [joined];
    }
  }
  return piece.split(/\s+/).filter((token) => token !== '');
}

function checkToken(token: string): string {
  const value = token.trim();
  if (value === '') {
    throw new Error('The Corbit SMS API token is missing. Reconnect your Corbit SMS account.');
  }
  if (!/^[\x21-\x7e]+$/.test(value)) {
    throw new Error(
      'The Corbit SMS API token contains spaces, line breaks or characters that are not allowed. Copy it again from sms.corbit.sa and reconnect.'
    );
  }
  return value;
}

function describeApiError({ status, body }: { status: number; body: unknown }): string {
  const message =
    isRecord(body) && typeof body['message'] === 'string' && body['message'] !== ''
      ? body['message'].slice(0, 300)
      : `Corbit SMS returned HTTP ${status}`;
  const code = isRecord(body) && typeof body['code'] === 'string' ? body['code'] : undefined;
  const hint =
    status === 401 ? UNAUTHORIZED_HINT : status === 429 ? RATE_LIMIT_HINT : code !== undefined ? CODE_HINTS[code] : undefined;
  return [message, hint, code !== undefined && hint === undefined ? `Corbit SMS code: ${code}` : undefined]
    .filter((part) => part !== undefined)
    .join(' ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class CorbitApiError extends Error {}

const CORBIT_BASE_URL = 'https://api.corbit.sa';
const REQUEST_TIMEOUT_MS = 30000;
const MAX_MESSAGE_LENGTH = 1600;
const MAX_DEDUPLICATION_KEY_LENGTH = 255;
const SENDER_PAGE_SIZE = 50;
const MAX_SENDER_PAGES = 100;
const ALLOWED_NUMBER = /^\+?[\d\s\-()]+$/;
const LIST_SEPARATORS = /[,;،؛\r\n\t]+/;
const SPACED_NUMBER = /^\+?[0-9٠-٩۰-۹()\-\s]+$/;
const MAYBE_SENT_HINT = 'The SMS may have been sent. Check its status before you send it again, so it is not sent twice.';
const UNAUTHORIZED_HINT = 'The API token was rejected. Reconnect your Corbit SMS account with a valid token from sms.corbit.sa.';
const RATE_LIMIT_HINT = 'Too many requests (the limit is 1000 per minute). Wait a moment and try again.';
const CODE_HINTS: Record<string, string> = {
  INSUFFICIENT_BALANCE: 'Your Corbit SMS balance is not enough. Top up at sms.corbit.sa and try again.',
  SENDER_NOT_ALLOWED: 'This sender name is not approved on your account. Pick one from the Sender Name list.',
  DUPLICATE: 'The same text was sent to the same number within the last hour. Turn on Allow Duplicate to send it again on purpose.',
  IDEMPOTENCY_IN_PROGRESS: 'A message with the same Deduplication Key is still being processed. Wait a moment and try again.',
  IDEMPOTENCY_KEY_REUSED: 'This Deduplication Key was already used for a different message. Use a different key for each message.',
};

export const corbitSmsCommon = {
  callApi,
  normalizeNumber,
  splitNumbers,
  parseNumbers,
  checkMessage,
  checkSenderName,
  sendHeaders,
  listSenderNames,
  senderNameDropdown,
};

type CallApiParams = {
  token: string;
  method: HttpMethod;
  path: string;
  body?: Record<string, unknown>;
  queryParams?: Record<string, string>;
  headers?: Record<string, string>;
  sends?: boolean;
};

type SendHeadersParams = {
  deduplicationKey: unknown;
  allowDuplicate: unknown;
};

type ReadSenderPagesParams = {
  token: string;
  page: number;
  collected: SenderName[];
  previousFirst: string | undefined;
};

type SenderName = {
  name: string;
  status: string;
  [key: string]: unknown;
};

type SenderNamesResponse = {
  data?: SenderName[];
  pagination?: { total?: number; per_page?: number; current_page?: number };
};

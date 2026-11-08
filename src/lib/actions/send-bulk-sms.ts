import { HttpMethod } from '@activepieces/pieces-common';
import { createAction, Property } from '@activepieces/pieces-framework';
import { corbitSmsAuth } from '../auth';
import { corbitSmsCommon } from '../common';

export const sendBulkSmsAction = createAction({
  auth: corbitSmsAuth,
  name: 'send_bulk_sms',
  classification: 'WRITE',
  displayName: 'Send SMS to Many Numbers',
  description: 'Sends the same SMS to many mobile numbers in one request.',
  audience: 'both',
  aiMetadata: {
    description:
      'Send the same SMS text to several mobile numbers in one Corbit SMS request. Use Send SMS for a single number. If any number is invalid nothing is sent; each call sends and charges new messages, so retries send again unless the same Deduplication Key is passed.',
    idempotent: false,
  },
  props: {
    senderName: corbitSmsCommon.senderNameDropdown(),
    numbers: Property.LongText({
      displayName: 'Numbers',
      description:
        'Mobile numbers in international format, separated by commas (the Arabic comma works too), semicolons, new lines or spaces. Duplicates are removed. If any number is invalid, nothing is sent.',
      required: true,
      placeholder: '966501234567, 966551234567',
    }),
    message: Property.LongText({
      displayName: 'Message',
      description: 'The text of the SMS, up to 1600 characters.',
      required: true,
    }),
    allowDuplicate: Property.Checkbox({
      displayName: 'Allow Duplicate',
      description: 'Send even if the same text went to the same numbers within the last hour.',
      required: false,
      defaultValue: false,
    }),
    deduplicationKey: Property.ShortText({
      displayName: 'Deduplication Key',
      description:
        'Optional. A value that identifies the event behind this message, such as a campaign or order number. A retry with the same key does not send again.',
      required: false,
    }),
  },
  async run(context) {
    const { senderName, numbers, message, allowDuplicate, deduplicationKey } = context.propsValue;
    const sender = corbitSmsCommon.checkSenderName(senderName);
    const parsed = corbitSmsCommon.parseNumbers(numbers);
    if (parsed.invalid.length > 0) {
      throw new Error(
        `These numbers are not valid: ${parsed.invalid.slice(0, 5).join(', ')}${parsed.invalid.length > 5 ? ` and ${parsed.invalid.length - 5} more` : ''}. Use the international format, for example 966501234567. Nothing was sent.`
      );
    }
    if (parsed.numbers.length === 0) {
      throw new Error('Numbers is empty. Add at least one mobile number.');
    }
    const messageBody = corbitSmsCommon.checkMessage(message);
    const response = await corbitSmsCommon.callApi<SendResponse>({
      token: context.auth.secret_text,
      method: HttpMethod.POST,
      path: '/api/v1/send-bulk',
      body: { senderName: sender, numbers: parsed.numbers, messageBody, sendAtOption: 'Now' },
      headers: corbitSmsCommon.sendHeaders({ deduplicationKey, allowDuplicate }),
      sends: true,
    });
    return {
      message_id: response.data?.message?.id ?? null,
      status: response.data?.message?.status ?? null,
      recipients: parsed.numbers.length,
      numbers: parsed.numbers.join(', '),
      sender_name: sender,
    };
  },
});

type SendResponse = {
  data?: { message?: { id?: string; status?: string } };
};

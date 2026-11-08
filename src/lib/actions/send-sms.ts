import { HttpMethod } from '@activepieces/pieces-common';
import { createAction, Property } from '@activepieces/pieces-framework';
import { corbitSmsAuth } from '../auth';
import { corbitSmsCommon } from '../common';

export const sendSmsAction = createAction({
  auth: corbitSmsAuth,
  name: 'send_sms',
  classification: 'WRITE',
  displayName: 'Send SMS',
  description: 'Sends an SMS to one mobile number.',
  audience: 'both',
  aiMetadata: {
    description:
      'Send one SMS text message to a single mobile number through Corbit SMS from an approved sender name. Use Send SMS to Many Numbers to send the same text to several numbers in one request. Each call sends and charges a new message, so retries send again unless the same Deduplication Key is passed.',
    idempotent: false,
  },
  props: {
    senderName: corbitSmsCommon.senderNameDropdown(),
    to: Property.ShortText({
      displayName: 'To',
      description:
        'The mobile number in international format, for example 966501234567. Saudi local numbers (05XXXXXXXX) are converted automatically; numbers of other countries must use the international format.',
      required: true,
      placeholder: '966501234567',
    }),
    message: Property.LongText({
      displayName: 'Message',
      description: 'The text of the SMS, up to 1600 characters.',
      required: true,
      placeholder: 'Your verification code is 4821',
    }),
    allowDuplicate: Property.Checkbox({
      displayName: 'Allow Duplicate',
      description:
        'Corbit SMS blocks the same text to the same number within one hour. Turn this on to send it again on purpose, for example to resend a one-time code.',
      required: false,
      defaultValue: false,
    }),
    deduplicationKey: Property.ShortText({
      displayName: 'Deduplication Key',
      description:
        'Optional. A value that identifies the event behind this message, such as an order number (sent as the Idempotency-Key header). If the same request is sent again with the same key, Corbit SMS returns the first result and does not send a second SMS. Use a different key for each message.',
      required: false,
    }),
  },
  async run(context) {
    const { senderName, to, message, allowDuplicate, deduplicationKey } = context.propsValue;
    const sender = corbitSmsCommon.checkSenderName(senderName);
    const number = corbitSmsCommon.normalizeNumber(to);
    if (number === undefined) {
      throw new Error(
        `"${String(to ?? '').slice(0, 40)}" is not a valid mobile number. Use the international format, for example 966501234567. Nothing was sent.`
      );
    }
    const messageBody = corbitSmsCommon.checkMessage(message);
    const response = await corbitSmsCommon.callApi<SendResponse>({
      token: context.auth.secret_text,
      method: HttpMethod.POST,
      path: '/api/v1/send',
      body: { senderName: sender, number, messageBody, sendAtOption: 'NOW' },
      headers: corbitSmsCommon.sendHeaders({ deduplicationKey, allowDuplicate }),
      sends: true,
    });
    return {
      message_id: response.data?.message?.id ?? null,
      status: response.data?.message?.status ?? null,
      to: number,
      sender_name: sender,
    };
  },
});

type SendResponse = {
  data?: { message?: { id?: string; status?: string } };
};

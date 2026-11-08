import { HttpMethod } from '@activepieces/pieces-common';
import { createAction, Property } from '@activepieces/pieces-framework';
import { corbitSmsAuth } from '../auth';
import { corbitSmsCommon } from '../common';

export const getMessageStatusAction = createAction({
  auth: corbitSmsAuth,
  name: 'get_message_status',
  classification: 'READ',
  displayName: 'Get Message Status',
  description: 'Gets the current status of a sent message.',
  audience: 'both',
  aiMetadata: {
    description:
      'Read the current status of one SMS sent through Corbit SMS, using the message ID returned by a send action. Use Get Delivery Report for the result of each recipient. Read-only and safe to retry.',
    idempotent: true,
  },
  props: {
    messageId: Property.ShortText({
      displayName: 'Message ID',
      description: 'The Message ID returned by Send SMS or Send SMS to Many Numbers.',
      required: true,
    }),
  },
  async run(context) {
    const messageId = String(context.propsValue.messageId ?? '').trim();
    if (messageId === '') {
      throw new Error('Message ID is empty. Use the Message ID returned by a send action.');
    }
    const response = await corbitSmsCommon.callApi<StatusResponse>({
      token: context.auth.secret_text,
      method: HttpMethod.POST,
      path: `/api/v1/message-status/${encodeURIComponent(messageId)}`,
    });
    return { message_id: messageId, status: response.data?.status ?? null };
  },
});

type StatusResponse = {
  data?: { status?: string };
};

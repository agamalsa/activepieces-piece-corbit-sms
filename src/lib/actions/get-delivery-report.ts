import { HttpMethod } from '@activepieces/pieces-common';
import { createAction, Property } from '@activepieces/pieces-framework';
import { corbitSmsAuth } from '../auth';
import { corbitSmsCommon } from '../common';

export const getDeliveryReportAction = createAction({
  auth: corbitSmsAuth,
  name: 'get_delivery_report',
  classification: 'READ',
  displayName: 'Get Delivery Report',
  description: 'Gets the delivery result for each recipient of a sent message.',
  audience: 'both',
  aiMetadata: {
    description:
      'Read the delivery result of every recipient of one Corbit SMS message, one row per recipient. Use Get Message Status for the overall status only. Read-only and safe to retry.',
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
    const response = await corbitSmsCommon.callApi<ReportResponse>({
      token: context.auth.secret_text,
      method: HttpMethod.POST,
      path: `/api/v1/message-report/${encodeURIComponent(messageId)}`,
    });
    const recipients = Array.isArray(response.msgs) ? response.msgs : [];
    if (recipients.length === 0) {
      return [{ message_id: messageId, job_id: response.jobId ?? null, number: null, status: null, accepted: null }];
    }
    return recipients.map((recipient) => ({
      message_id: messageId,
      job_id: response.jobId ?? null,
      number: recipient.destAddress ?? null,
      status: recipient.status ?? null,
      accepted: recipient.accepted ?? null,
    }));
  },
});

type ReportResponse = {
  jobId?: string;
  msgs?: { destAddress?: string; status?: string; accepted?: boolean }[];
};

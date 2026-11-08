import { createAction, Property } from '@activepieces/pieces-framework';
import { corbitSmsAuth } from '../auth';
import { corbitSmsCommon } from '../common';

export const listSenderNamesAction = createAction({
  auth: corbitSmsAuth,
  name: 'list_sender_names',
  classification: 'SEARCH',
  displayName: 'List Sender Names',
  description: 'Lists the sender names on your Corbit SMS account and their approval status.',
  audience: 'both',
  aiMetadata: {
    description:
      'List the sender names on the connected Corbit SMS account with their status (approved, pending, rejected, expired). Only approved sender names can send. Read-only and safe to retry.',
    idempotent: true,
  },
  props: {
    status: Property.StaticDropdown({
      displayName: 'Status',
      description: 'Return only sender names with this status.',
      required: false,
      defaultValue: 'all',
      options: {
        options: [
          { label: 'All', value: 'all' },
          { label: 'Approved', value: 'approved' },
          { label: 'Pending', value: 'pending' },
          { label: 'Rejected', value: 'rejected' },
          { label: 'Expired', value: 'expired' },
        ],
      },
    }),
  },
  async run(context) {
    const wanted = context.propsValue.status ?? 'all';
    const senders = await corbitSmsCommon.listSenderNames({ token: context.auth.secret_text });
    return senders
      .filter((sender) => wanted === 'all' || String(sender.status).toLowerCase() === wanted)
      .map((sender) => ({ name: String(sender.name), status: String(sender.status).toLowerCase() }));
  },
});

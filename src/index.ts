import { createCustomApiCallAction } from '@activepieces/pieces-common';
import { createPiece, PieceCategory } from '@activepieces/pieces-framework';
import { corbitSmsAuth } from './lib/auth';
import { sendSmsAction } from './lib/actions/send-sms';
import { sendBulkSmsAction } from './lib/actions/send-bulk-sms';
import { getMessageStatusAction } from './lib/actions/get-message-status';
import { getDeliveryReportAction } from './lib/actions/get-delivery-report';
import { getBalanceAction } from './lib/actions/get-balance';
import { listSenderNamesAction } from './lib/actions/list-sender-names';

export const corbitSms = createPiece({
  displayName: 'Corbit SMS',
  description: 'Send SMS messages in Saudi Arabia and check their delivery with Corbit SMS.',
  minimumSupportedRelease: '0.88.2',
  logoUrl: 'https://cdn.jsdelivr.net/npm/n8n-nodes-corbit-sms@1.1.2/dist/icons/corbit.svg',
  categories: [PieceCategory.COMMUNICATION],
  auth: corbitSmsAuth,
  authors: ['agamalsa'],
  actions: [
    sendSmsAction,
    sendBulkSmsAction,
    getMessageStatusAction,
    getDeliveryReportAction,
    getBalanceAction,
    listSenderNamesAction,
    createCustomApiCallAction({
      baseUrl: () => 'https://api.corbit.sa/api/v1',
      auth: corbitSmsAuth,
      authMapping: async (auth) => ({
        Authorization: `Bearer ${auth.secret_text.trim()}`,
      }),
    }),
  ],
  triggers: [],
});

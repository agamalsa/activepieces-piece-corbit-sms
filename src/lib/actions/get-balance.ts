import { HttpMethod } from '@activepieces/pieces-common';
import { createAction } from '@activepieces/pieces-framework';
import { corbitSmsAuth } from '../auth';
import { corbitSmsCommon } from '../common';

export const getBalanceAction = createAction({
  auth: corbitSmsAuth,
  name: 'get_balance',
  classification: 'READ',
  displayName: 'Get Balance',
  description: 'Gets the remaining SMS balance of your Corbit SMS account.',
  audience: 'both',
  aiMetadata: {
    description:
      'Read the remaining SMS balance of the connected Corbit SMS account, for example to check there is enough before sending. Read-only and safe to retry.',
    idempotent: true,
  },
  props: {},
  async run(context) {
    const response = await corbitSmsCommon.callApi<BalanceResponse>({
      token: context.auth.secret_text,
      method: HttpMethod.POST,
      path: '/api/v1/get-balance',
    });
    return { balance: response.data?.balance ?? null };
  },
});

type BalanceResponse = {
  data?: { balance?: number };
};

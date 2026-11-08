import { HttpError, HttpMethod, httpClient } from '@activepieces/pieces-common';
import { PieceAuth } from '@activepieces/pieces-framework';

export const corbitSmsAuth = PieceAuth.SecretText({
  displayName: 'API Token',
  description: `To get your API token:
1. Sign in to your Corbit SMS account at [sms.corbit.sa](https://sms.corbit.sa).
2. Open the API settings.
3. Copy the API token and paste it here.`,
  required: true,
  validate: async ({ auth }) => {
    try {
      await httpClient.sendRequest({
        method: HttpMethod.POST,
        url: 'https://api.corbit.sa/api/v1/get-balance',
        headers: { Accept: 'application/json', Authorization: `Bearer ${auth.trim()}` },
        timeout: 30000,
      });
      return { valid: true };
    } catch (error) {
      if (error instanceof HttpError && error.response.status === 401) {
        return { valid: false, error: 'The API token was rejected. Copy it again from sms.corbit.sa.' };
      }
      return { valid: false, error: 'Could not check the API token with Corbit SMS. Try again in a moment.' };
    }
  },
});

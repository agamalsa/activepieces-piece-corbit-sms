# Corbit SMS for Activepieces

An [Activepieces](https://www.activepieces.com) piece for [Corbit SMS](https://sms.corbit.sa), an SMS gateway in Saudi Arabia. Send SMS messages from your flows and AI agents, check whether they were delivered, and read your balance and sender names.

## Install

This piece is published on npm as [`@corbit2/piece-corbit-sms`](https://www.npmjs.com/package/@corbit2/piece-corbit-sms). Activepieces installs community pieces from npm per platform:

1. Sign in to your Activepieces as a platform admin.
2. Open **Platform Admin → Pieces → Install Piece**.
3. Choose **NPM Registry**, enter `@corbit2/piece-corbit-sms` and install.

Requires Activepieces 0.88.2 or later.

## Actions

| Action | What it does |
|---|---|
| Send SMS | Sends an SMS to one mobile number |
| Send SMS to Many Numbers | Sends the same SMS to many numbers in one request |
| Get Message Status | Returns the current status of a sent message |
| Get Delivery Report | Returns the delivery result of each recipient, one row per recipient |
| Get Balance | Returns the remaining SMS balance |
| List Sender Names | Lists your sender names and their approval status |
| Custom API Call | Calls any other Corbit SMS endpoint with your connection |

Every action except Custom API Call can also be used as a tool by Activepieces AI agents.

## Connect your account

1. Sign in at [sms.corbit.sa](https://sms.corbit.sa) and open the API settings.
2. Copy your API token.
3. In Activepieces, add a **Corbit SMS** connection and paste the token. Activepieces checks it by reading your balance.

## Good to know

- **Phone numbers.** Use the international format, for example `966501234567`. Spaces, dashes, brackets, a leading `+` or `00` are removed, and Arabic digits are accepted. Saudi local numbers (`05XXXXXXXX`) become `9665XXXXXXXX`. Anything that could turn into a wrong number is rejected and nothing is sent: local numbers of other countries, decimals such as `9.66501E+11` from a spreadsheet, and extra text such as `ext 12`.
- **Many numbers.** Separate them with commas (the Arabic comma « ، » works too), semicolons or new lines; numbers written without spaces can also be separated by spaces. A list mapped from another step (an array) works too. Duplicates are removed, and if any number is invalid nothing is sent.
- **Sender Name.** Pick one of your approved sender names from the list.
- **Duplicates.** Corbit SMS blocks the same text to the same number within one hour. Turn on **Allow Duplicate** to send it again on purpose, for example an OTP resend.
- **Safe retries.** Set **Deduplication Key** to a value that identifies the event, such as an order number. A retry with the same key returns the first result and sends nothing new.
- **Timeouts.** If Corbit SMS does not reply within 30 seconds the step fails, but the SMS may still have been sent. Check its status before sending again.
- **Output.** Every action returns flat fields (for example `message_id`, `status`, `to`), ready for Google Sheets or Activepieces Tables.
- **Languages.** The piece's labels are in English and Arabic.

## Links

- [Corbit SMS API documentation](https://api.corbit.sa/doc)
- [Report a problem](https://github.com/agamalsa/activepieces-piece-corbit-sms/issues)

## License

MIT

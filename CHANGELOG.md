# Changelog

## 1.0.0 (2026-11-08)

First release.

- **Send SMS** to one number and **Send SMS to Many Numbers** in one request, from an approved sender name picked from a list.
- **Get Message Status**, **Get Delivery Report** (one row per recipient), **Get Balance** and **List Sender Names**.
- **Custom API Call** for any other Corbit SMS endpoint.
- Every action works as a tool for Activepieces AI agents.
- Phone numbers and lists are read the same way as the Corbit SMS app: Saudi local numbers are converted, Arabic digits and the Arabic comma are accepted, and anything that could turn into a wrong number is rejected before sending.
- Allow Duplicate switch and a Deduplication Key for safe retries; a timeout or server error on a send warns that the SMS may already have been sent.
- English and Arabic labels.

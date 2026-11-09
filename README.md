# n8n-nodes-mailchannels

An [n8n](https://n8n.io/) community node for sending email with the
[MailChannels Email API](https://docs.mailchannels.com/email-api/overview).

## Installation

Follow the n8n guide to [installing community nodes](https://docs.n8n.io/integrations/community-nodes/installation/)
and install `@mailchannels/n8n-nodes-mailchannels`.

## Credentials

Create a **MailChannels API** credential with your Email API key. The credential
test calls `GET /usage` and never sends email.

## Operations

The **Email** resource has two operations:

- **Validate** (default) checks a message with the API without delivering it.
- **Send** sends the message.

**Input Mode** chooses how you describe the message:

- **JSON** (default) takes an Email API request body with `from`, `personalizations`,
  `subject` and `content`. Use it for named recipients, several content parts,
  personalizations or other API options.
- **Fields** covers a single message: sender, comma-separated To addresses, subject,
  text or HTML body, and optional CC, BCC, reply-to and sender name. Addresses in
  this mode can't include display names.

Both drafts stay editable when you switch modes; only the selected mode is validated
and sent. **Attachment Binary Fields** takes a comma-separated list of binary
properties to attach from the incoming item. Expressions resolve for each item.

## Limits and retries

- An email can have at most 1,000 attachments, and the node rejects a serialized
  request larger than 30,000,000 bytes before sending. MailChannels separately
  enforces its 30 MB message limit.
- Requests go only to `https://api.mailchannels.net`, don't follow redirects and
  time out after 30 seconds. The node never retries on its own.
- An API acceptance is not a delivery. If a send fails after the request was made,
  the message may still have been accepted, so check before sending it again.
  Leave **Retry On Fail** off for Send: each retry sends another copy.
- With **Continue On Fail**, failed items return a sanitized error paired with
  their input, and later items still run.

## Development

Requires Node.js 24 or later.

```
npm ci
npm run lint
npm run build
npm test
```

## Releases

Pushing a version tag such as `0.1.0` runs `.github/workflows/publish.yml`, which
publishes to npm with a provenance statement, as n8n requires for verified
community nodes.

## Support

Open an issue at https://github.com/mailchannels/n8n-nodes-mailchannels/issues or
email dev@mailchannels.com. MailChannels customers with a problem with the
MailChannels service can get support at https://support.mailchannels.com/.

## License

[MIT](LICENSE)

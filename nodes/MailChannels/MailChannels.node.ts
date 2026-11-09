import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

// Local serialized-JSON budget; the provider separately enforces its encoded-message limit.
const MAX_REQUEST_BYTES = 30_000_000;

// Binary attachments need incoming item data; AI-tool execution is not supported.
export class MailChannels implements INodeType {
	description: INodeTypeDescription = {
		usableAsTool: undefined,
		icon: { light: 'file:mailchannels.svg', dark: 'file:mailchannels.svg' },
		subtitle: '={{$parameter.operation}}',
		displayName: 'MailChannels',
		name: 'mailChannels',
		group: ['output'],
		version: 1,
		description: 'Validate or send email using MailChannels',
		defaults: { name: 'MailChannels' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'mailChannelsApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [{ name: 'Email', value: 'email' }],
				default: 'email',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Send',
						value: 'send',
						action: 'Send an email',
						description: 'Submit email for delivery',
					},
					{
						name: 'Validate',
						value: 'validate',
						action: 'Validate an email',
						description: 'Validate without sending email',
					},
				],
				default: 'validate',
			},
			{
				displayName: 'Input Mode',
				name: 'inputMode',
				type: 'options',
				noDataExpression: true,
				default: 'json',
				options: [
					{ name: 'Fields', value: 'fields' },
					{ name: 'JSON', value: 'json' },
				],
				description:
					'Use fields for a single message or JSON for advanced options. Both drafts stay editable; only the selected mode is sent.',
			},
			{
				displayName: 'From Email',
				name: 'fromEmail',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { inputMode: ['fields'] } },
				placeholder: 'sender@example.com',
				description: 'Sender email address without a display name',
			},
			// Keep the inactive draft visible without applying active-mode required checks.
			{
				displayName: 'From Email',
				name: 'fromEmail',
				type: 'string',
				default: '',
				displayOptions: { show: { inputMode: ['json'] } },
				placeholder: 'sender@example.com',
				description: 'Sender email address without a display name',
			},
			{
				displayName: 'To Emails',
				name: 'toEmails',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { inputMode: ['fields'] } },
				placeholder: 'recipient@example.com',
				description: 'Comma-separated email addresses without display names',
			},
			// Keep the inactive draft visible without applying active-mode required checks.
			{
				displayName: 'To Emails',
				name: 'toEmails',
				type: 'string',
				default: '',
				displayOptions: { show: { inputMode: ['json'] } },
				placeholder: 'recipient@example.com',
				description: 'Comma-separated email addresses without display names',
			},
			{
				displayName: 'Subject',
				name: 'subject',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Email Format',
				name: 'emailFormat',
				type: 'options',
				default: 'text',
				options: [
					{ name: 'HTML', value: 'html' },
					{ name: 'Text', value: 'text' },
				],
			},
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				default: '',
				required: true,
				typeOptions: { rows: 5 },
				displayOptions: { show: { inputMode: ['fields'] } },
			},
			// Keep the inactive draft visible without applying active-mode required checks.
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				default: '',
				typeOptions: { rows: 5 },
				displayOptions: { show: { inputMode: ['json'] } },
			},
			{
				displayName: 'Options',
				name: 'emailOptions',
				type: 'collection',
				default: {},
				placeholder: 'Add Option',
				options: [
					{
						displayName: 'BCC Emails',
						name: 'bcc',
						type: 'string',
						default: '',
						description: 'Comma-separated email addresses without display names',
					},
					{
						displayName: 'CC Emails',
						name: 'cc',
						type: 'string',
						default: '',
						description: 'Comma-separated email addresses without display names',
					},
					{
						displayName: 'Reply To Email',
						name: 'replyTo',
						type: 'string',
						default: '',
						description: 'Reply-to email address without a display name',
					},
					{ displayName: 'Sender Name', name: 'senderName', type: 'string', default: '' },
				],
			},
			{
				displayName: 'Email Payload',
				name: 'payload',
				displayOptions: { show: { inputMode: ['json'] } },
				type: 'json',
				required: true,
				default:
					'{"from":{"email":"sender@example.com"},"personalizations":[{"to":[{"email":"recipient@example.com"}]}],"subject":"Example","content":[{"type":"text/plain","value":"Hello"}]}',
				description: 'Email API JSON body, including To/Cc/Bcc, Reply-To and optional attachments',
			},
			// Keep the inactive draft visible without applying active-mode required checks.
			{
				displayName: 'Email Payload',
				name: 'payload',
				displayOptions: { show: { inputMode: ['fields'] } },
				type: 'json',
				default:
					'{"from":{"email":"sender@example.com"},"personalizations":[{"to":[{"email":"recipient@example.com"}]}],"subject":"Example","content":[{"type":"text/plain","value":"Hello"}]}',
				description: 'Email API JSON body, including To/Cc/Bcc, Reply-To and optional attachments',
			},
			{
				displayName: 'Attachment Binary Fields',
				name: 'binaryFields',
				type: 'string',
				default: '',
				description: 'Comma-separated incoming binary field names to append as attachments',
			},
		],
	};
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const output: INodeExecutionData[] = [];
		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			let dispatched = false;
			try {
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				if (!['send', 'validate'].includes(operation))
					throw new NodeOperationError(this.getNode(), 'Invalid operation');
				const mode = this.getNodeParameter('inputMode', itemIndex, 'json') as string;
				let body: IDataObject;
				if (mode === 'fields') {
					const address = (value: unknown): { email: string } => {
						if (typeof value !== 'string' || /[\r\n]/.test(value))
							throw new NodeOperationError(this.getNode(), 'Invalid address');
						const email = value.trim();
						if (!/^[^\s@<>,;]+@[^\s@<>,;]+$/.test(email))
							throw new NodeOperationError(this.getNode(), 'Invalid address');
						return { email };
					};
					const addresses = (value: unknown) => {
						if (typeof value !== 'string')
							throw new NodeOperationError(this.getNode(), 'Invalid recipients');
						return value.split(',').map(address);
					};
					const options = this.getNodeParameter('emailOptions', itemIndex, {}) as IDataObject;
					const from: IDataObject = address(this.getNodeParameter('fromEmail', itemIndex));
					if (options.senderName) from.name = options.senderName;
					const personalization: IDataObject = {
						to: addresses(this.getNodeParameter('toEmails', itemIndex)),
					};
					for (const key of ['cc', 'bcc'])
						if (options[key]) personalization[key] = addresses(options[key]);
					const format = this.getNodeParameter('emailFormat', itemIndex, 'text');
					if (!['text', 'html'].includes(format as string))
						throw new NodeOperationError(this.getNode(), 'Invalid format');
					const message = this.getNodeParameter('message', itemIndex);
					const subject = this.getNodeParameter('subject', itemIndex, '');
					if (
						typeof message !== 'string' ||
						!message.length ||
						typeof subject !== 'string' ||
						/[\r\n]/.test(subject)
					)
						throw new NodeOperationError(this.getNode(), 'Invalid message');
					if (
						from.name !== undefined &&
						(typeof from.name !== 'string' || /[\r\n]/.test(from.name))
					)
						throw new NodeOperationError(this.getNode(), 'Invalid sender name');
					body = {
						from,
						personalizations: [personalization],
						subject,
						content: [{ type: format === 'html' ? 'text/html' : 'text/plain', value: message }],
					};
					if (options.replyTo) body.reply_to = address(options.replyTo);
				} else if (mode === 'json') {
					const raw = this.getNodeParameter('payload', itemIndex);
					body = (typeof raw === 'string' ? JSON.parse(raw) : structuredClone(raw)) as IDataObject;
				} else throw new NodeOperationError(this.getNode(), 'Invalid input mode');
				if (
					!body ||
					Array.isArray(body) ||
					typeof body !== 'object' ||
					!body.from ||
					!Array.isArray(body.personalizations) ||
					!body.personalizations.length ||
					typeof body.subject !== 'string' ||
					!Array.isArray(body.content) ||
					!body.content.length
				)
					throw new NodeOperationError(this.getNode(), 'Invalid payload');
				let requestBytes = Buffer.byteLength(JSON.stringify(body), 'utf8');
				if (requestBytes > MAX_REQUEST_BYTES)
					throw new NodeOperationError(this.getNode(), 'Local request size limit exceeded');
				const fields = (this.getNodeParameter('binaryFields', itemIndex, '') as string)
					.split(',')
					.map((v) => v.trim())
					.filter(Boolean);
				if (new Set(fields).size !== fields.length)
					throw new NodeOperationError(this.getNode(), 'Duplicate binary field');
				if (body.attachments !== undefined && !Array.isArray(body.attachments))
					throw new NodeOperationError(this.getNode(), 'Invalid attachments');
				const attachments = [...((body.attachments ?? []) as IDataObject[])];
				if (attachments.length + fields.length > 1000)
					throw new NodeOperationError(this.getNode(), 'Maximum attachment count exceeded');
				if (fields.length) {
					body.attachments = attachments;
					requestBytes = Buffer.byteLength(JSON.stringify(body), 'utf8');
					if (requestBytes > MAX_REQUEST_BYTES)
						throw new NodeOperationError(this.getNode(), 'Local request size limit exceeded');
				}
				for (const field of fields) {
					const info = this.helpers.assertBinaryData(itemIndex, field);
					if (
						!info.fileName ||
						[...info.fileName].some((c) => c.charCodeAt(0) < 32) ||
						!info.mimeType ||
						[...info.mimeType].some((c) => c.charCodeAt(0) < 32)
					)
						throw new NodeOperationError(this.getNode(), 'Invalid attachment metadata');
					const bytes = await this.helpers.getBinaryDataBuffer(itemIndex, field);
					const attachment = { filename: info.fileName, type: info.mimeType, content: '' };
					requestBytes +=
						Buffer.byteLength(JSON.stringify(attachment), 'utf8') +
						4 * Math.ceil(bytes.length / 3) +
						(attachments.length ? 1 : 0);
					if (requestBytes > MAX_REQUEST_BYTES)
						throw new NodeOperationError(this.getNode(), 'Local attachment size limit exceeded');
					attachment.content = bytes.toString('base64');
					attachments.push(attachment);
				}
				if (attachments.length) body.attachments = attachments;
				if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_REQUEST_BYTES)
					throw new NodeOperationError(this.getNode(), 'Local request size limit exceeded');
				const credentials = await this.getCredentials('mailChannelsApi');
				if (typeof credentials.apiKey !== 'string' || !/^[\x21-\x7e]+$/.test(credentials.apiKey))
					throw new NodeOperationError(this.getNode(), 'Invalid credential');
				dispatched = true;
				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'mailChannelsApi',
					{
						method: 'POST',
						url: 'https://api.mailchannels.net/tx/v1/send',
						qs: operation === 'validate' ? { 'dry-run': true } : {},
						body,
						json: true,
						disableFollowRedirect: true,
						skipSslCertificateValidation: false,
						returnFullResponse: true,
						timeout: 30000,
					},
				);
				const expected = operation === 'validate' ? 200 : 202;
				if (response.statusCode !== expected)
					throw new NodeOperationError(this.getNode(), 'Unexpected status');
				const result: IDataObject = {
					status: operation === 'validate' ? 'validated' : 'accepted',
					statusCode: expected,
					dryRun: operation === 'validate',
				};
				if (
					operation === 'validate' &&
					(!Array.isArray(response.body?.data) ||
						!response.body.data.every((v: unknown) => typeof v === 'string'))
				)
					throw new NodeOperationError(this.getNode(), 'Unexpected validation response');
				if (typeof response.body?.request_id === 'string')
					result.requestId = response.body.request_id;
				output.push({ json: result, pairedItem: { item: itemIndex } });
			} catch {
				const message = dispatched
					? 'Email API request failed or acceptance is unknown. Investigate before retrying.'
					: 'Email configuration or attachment validation failed before dispatch.';
				if (this.continueOnFail())
					output.push({ json: { error: message, dispatched }, pairedItem: { item: itemIndex } });
				else throw new NodeOperationError(this.getNode(), message, { itemIndex });
			}
		}
		return [output];
	}
}

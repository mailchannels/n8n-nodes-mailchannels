import type {
	ICredentialTestRequest,
	Icon,
	IAuthenticateGeneric,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class MailChannelsApi implements ICredentialType {
	icon: Icon = { light: 'file:mailchannels.svg', dark: 'file:mailchannels.svg' };
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.mailchannels.net/tx/v1',
			url: '/usage',
			method: 'GET',
			disableFollowRedirect: true,
			timeout: 30000,
		},
	};
	name = 'mailChannelsApi';
	displayName = 'MailChannels API';
	documentationUrl = 'https://docs.mailchannels.com/email-api/overview';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
	];
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { 'X-Api-Key': '={{$credentials.apiKey}}' } },
	};
}

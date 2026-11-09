const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MailChannels } = require('../dist/nodes/MailChannels/MailChannels.node.js');
const { MailChannelsApi } = require('../dist/credentials/MailChannelsApi.credentials.js');
const base={from:{email:'sender@example.invalid'},personalizations:[{to:[{email:'to@example.invalid'}],cc:[{email:'cc@example.invalid'}],bcc:[{email:'bcc@example.invalid'}]}],reply_to:{email:'reply@example.invalid'},subject:'café',content:[{type:'text/plain',value:'hello'},{type:'text/html',value:'<p>hello</p>'}]};
function fixture(params=[{}],responses=[],keep=false) {
 const calls=[];
 const context={getInputData:()=>params.map(()=>({json:{}})),getNode:()=>({name:'fixture',type:'mailChannels',typeVersion:1,position:[0,0],parameters:{}}),getNodeParameter:(name,index,def)=>params[index][name]??({operation:'validate',payload:JSON.stringify(base),binaryFields:''}[name]??def),getCredentials:async()=>({apiKey:'synthetic-key'}),continueOnFail:()=>keep,helpers:{assertBinaryData:()=>({fileName:'example.bin',mimeType:'application/octet-stream'}),getBinaryDataBuffer:async()=>Buffer.from([0,255,1]),httpRequestWithAuthentication:async function(name,options){calls.push({name,options});let r=responses.shift();if(r instanceof Error)throw r;return r??{statusCode:200,body:{data:['rendered']}};}}};
 return {calls,context,run:()=>new MailChannels().execute.call(context)};
}
test('validate default and payload identities preserved',async()=>{const f=fixture();const [[out]]=await f.run();assert.equal(out.json.status,'validated');assert.deepEqual(out.pairedItem,{item:0});assert.deepEqual(f.calls[0].options.body,base);assert.deepEqual(f.calls[0].options.qs,{'dry-run':true});assert.equal(f.calls[0].options.url,'https://api.mailchannels.net/tx/v1/send');assert.equal(f.calls[0].options.disableFollowRedirect,true);assert.equal(f.calls[0].options.skipSslCertificateValidation,false);assert.equal(f.calls[0].options.timeout,30000);});
test('send accepts empty202 and preserves request ID when supplied',async()=>{for(const body of ['',{request_id:'fixture-id'}]){const f=fixture([{operation:'send'}],[{statusCode:202,body}]);const [[out]]=await f.run();assert.equal(out.json.status,'accepted');assert.equal(out.json.requestId,body.request_id);assert.deepEqual(f.calls[0].options.qs,{});}});
test('multiple inputs retain independent paired results',async()=>{const f=fixture([{},{}]);const [out]=await f.run();assert.equal(f.calls.length,2);assert.deepEqual(out.map(x=>x.pairedItem.item),[0,1]);});
test('binary attachment bytes preserved',async()=>{const f=fixture([{binaryFields:'data'}]);await f.run();assert.deepEqual(f.calls[0].options.body.attachments,[{filename:'example.bin',type:'application/octet-stream',content:'AP8B'}]);});
test('bad JSON and duplicate attachment fields prevent dispatch',async()=>{for(const p of [{payload:'not json'},{binaryFields:'data,data'},{operation:'unknown'}]){const f=fixture([p]);await assert.rejects(f.run(),/before dispatch/);assert.equal(f.calls.length,0);}});
test('credential injection rejected before dispatch',async()=>{const f=fixture();f.context.getCredentials=async()=>({apiKey:'secret\r\nInjected: yes'});await assert.rejects(f.run(),/before dispatch/);assert.equal(f.calls.length,0);});
test('transport errors sanitized and never retried',async()=>{const f=fixture([{}],[new Error('secret-key private-body')]);await assert.rejects(f.run(),e=>!e.message.includes('secret-key')&&e.message.includes('acceptance is unknown'));assert.equal(f.calls.length,1);});
test('continue on fail preserves item pairing and proceeds',async()=>{const f=fixture([{},{}],[new Error('secret'),{statusCode:200,body:{data:[]}}],true);const [out]=await f.run();assert.equal(out[0].json.dispatched,true);assert.equal(out[1].json.status,'validated');assert.equal(out[1].pairedItem.item,1);assert.equal(f.calls.length,2);});
test('redirect and malformed validation response are not success',async()=>{for(const response of [{statusCode:307,body:{}},{statusCode:200,body:{data:'invalid'}}]){const f=fixture([{}],[response]);await assert.rejects(f.run(),/acceptance is unknown/);assert.equal(f.calls.length,1);}});
test('credential schema masks key and uses a non-sending test',()=>{const c=new MailChannelsApi();assert.equal(c.properties[0].typeOptions.password,true);assert.equal(c.test.request.method,'GET');assert.equal(c.test.request.url,'/usage');assert.equal(c.test.request.disableFollowRedirect,true);});
const fields={inputMode:'fields',fromEmail:' sender@example.invalid ',toEmails:'first@example.invalid, second@example.invalid',subject:'café',message:'<p>Hello</p>',emailFormat:'html',emailOptions:{senderName:'Sender',cc:'cc@example.invalid',bcc:'bcc@example.invalid',replyTo:'reply@example.invalid'}};
test('retained inactive drafts are never read or sent',async()=>{
 for(const mode of ['fields','json']) {
  const f=fixture([{...fields,inputMode:mode}]);
  const get=f.context.getNodeParameter;
  f.context.getNodeParameter=(name,...args)=>{
   const inactive=mode==='fields'?name==='payload':['fromEmail','toEmails','subject','message','emailFormat','emailOptions'].includes(name);
   assert.equal(inactive,false,'Inactive draft read: '+name);
   return get(name,...args);
  };
  await f.run();
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].options.body.subject,mode==='fields'?fields.subject:base.subject);
  assert.equal(f.calls[0].options.body.content[0].value,mode==='fields'?fields.message:base.content[0].value);
 }
});
test('guided fields map identities/content and preserve binary attachments',async()=>{const f=fixture([{...fields,binaryFields:'data'}]);await f.run();assert.deepEqual(f.calls[0].options.body,{from:{email:'sender@example.invalid',name:'Sender'},personalizations:[{to:[{email:'first@example.invalid'},{email:'second@example.invalid'}],cc:[{email:'cc@example.invalid'}],bcc:[{email:'bcc@example.invalid'}]}],subject:'café',reply_to:{email:'reply@example.invalid'},content:[{type:'text/html',value:'<p>Hello</p>'}],attachments:[{filename:'example.bin',type:'application/octet-stream',content:'AP8B'}]});});
test('guided plain text maps per item independently',async()=>{const f=fixture([{...fields,emailFormat:'text',emailOptions:{}},{...fields,subject:'second',toEmails:'other@example.invalid'}]);const [out]=await f.run();assert.equal(f.calls[0].options.body.content[0].type,'text/plain');assert.equal(f.calls[0].options.body.reply_to,undefined);assert.equal(f.calls[1].options.body.subject,'second');assert.deepEqual(out.map(i=>i.pairedItem.item),[0,1]);});
test('guided invalid addresses/header injection/empty message fail before dispatch',async()=>{for(const p of [{toEmails:'good@example.invalid,'},{fromEmail:'Name <a@example.invalid>'},{toEmails:'bad'},{toEmails:'a@example.invalid\r\n'},{subject:'hello\nBcc: x'},{message:''},{emailFormat:'unknown'},{emailOptions:{senderName:'bad\nname'}},{emailOptions:{replyTo:'invalid'}},{inputMode:'unknown'}]){const f=fixture([{...fields,...p}]);await assert.rejects(f.run(),/before dispatch/);assert.equal(f.calls.length,0);}});

test('attachment count allows1000 and rejects1001 before binary reads or dispatch',async()=>{const a={filename:'a.txt',type:'text/plain',content:'YQ=='};for(const [count,binaryFields,pass] of [[1000,'',true],[1001,'',false],[999,'data',true],[1000,'data',false]]){const f=fixture([{payload:JSON.stringify({...base,attachments:Array.from({length:count},()=>({...a}))}),binaryFields}]);let reads=0;const original=f.context.helpers.getBinaryDataBuffer;f.context.helpers.getBinaryDataBuffer=async(...args)=>{reads++;return original(...args)};if(pass){await f.run();assert.equal(f.calls[0].options.body.attachments.length,1000);}else{await assert.rejects(f.run(),/before dispatch/);assert.equal(f.calls.length,0);assert.equal(reads,0);}}});
test('attachment limit failure retains pairing and later item with Continue On Fail',async()=>{const f=fixture([{payload:JSON.stringify({...base,attachments:Array(1001).fill({filename:'a',type:'text/plain',content:'YQ=='})})},{}],[],true);const [out]=await f.run();assert.equal(out[0].json.dispatched,false);assert.equal(out[0].pairedItem.item,0);assert.equal(out[1].json.status,'validated');assert.equal(out[1].pairedItem.item,1);assert.equal(f.calls.length,1);});

function sizedPayload(bytes, char='a') {
 const payload=structuredClone(base); payload.content=[{type:'text/plain',value:''}];
 const overhead=Buffer.byteLength(JSON.stringify(payload));
 payload.content[0].value=char.repeat(Math.ceil((bytes-overhead)/Buffer.byteLength(char)));
 return payload;
}
test('serialized JSON byte boundary preserves exact payload at30million bytes',async()=>{
 const payload=sizedPayload(30_000_000);assert.equal(Buffer.byteLength(JSON.stringify(payload)),30_000_000);
 const f=fixture([{payload}]);await f.run();assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].options.body,payload);
});
test('oversized JSON rejects before credential access or binary reads',async()=>{
 const f=fixture([{payload:sizedPayload(30_000_001),binaryFields:'data'}]);let touched=0;
 f.context.getCredentials=async()=>{touched++;throw Error('not reached');};f.context.helpers.getBinaryDataBuffer=async()=>{touched++;throw Error('not reached');};
 await assert.rejects(f.run(),/before dispatch/);assert.equal(touched,0);assert.equal(f.calls.length,0);
});
test('UTF8 bytes rather than JavaScript character count determine local budget',async()=>{
 const payload=sizedPayload(30_000_001,'😀');assert(JSON.stringify(payload).length<30_000_000);
 const f=fixture([{payload}]);await assert.rejects(f.run(),/before dispatch/);assert.equal(f.calls.length,0);
});
test('base64 expansion of binary attachments counts toward final request budget',async()=>{
 const f=fixture([{binaryFields:'data'}]);let credentials=0,encoded=0;
 f.context.helpers.getBinaryDataBuffer=async()=>{const bytes=Buffer.alloc(22_500_000);bytes.toString=()=>{encoded++;return '';};return bytes;};
 f.context.getCredentials=async()=>{credentials++;return {apiKey:'synthetic-key'};};
 await assert.rejects(f.run(),/before dispatch/);assert.equal(credentials,0);assert.equal(encoded,0);assert.equal(f.calls.length,0);
});
test('oversized first item can continue with paired later item',async()=>{
 const f=fixture([{payload:sizedPayload(30_000_001)},{}],[],true);const [out]=await f.run();
 assert.deepEqual(out[0].json,{error:'Email configuration or attachment validation failed before dispatch.',dispatched:false});
 assert.equal(out[0].pairedItem.item,0);assert.equal(out[1].pairedItem.item,1);assert.equal(out[1].json.status,'validated');assert.equal(f.calls.length,1);
});

test('cumulative binary budget stops before reading later fields',async()=>{
 const f=fixture([{binaryFields:'one,two,three'}]);let reads=0;
 f.context.helpers.getBinaryDataBuffer=async()=>{reads++;return Buffer.alloc(12_000_000);};
 await assert.rejects(f.run(),/before dispatch/);assert.equal(reads,2);assert.equal(f.calls.length,0);
});

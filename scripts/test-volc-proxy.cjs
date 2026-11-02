// Isolated proxy integration: real compiled proxy/codec with an in-memory ws transport.
const assert = require('node:assert/strict'), { EventEmitter } = require('node:events'), pako = require('pako')
const wsModule = require('ws')
class FakeSocket extends EventEmitter {
 static OPEN = 1
 static instances = []
 readyState = 1
 bufferedAmount = 0
 sent = []
 constructor(url, options) { super(); this.url=url;this.options=options;FakeSocket.instances.push(this) }
 send(value){this.sent.push(value)}
 close(){if(this.readyState!==3){this.readyState=3;this.emit('close')}}
}
wsModule.WebSocket = FakeSocket
const { attachVolcProxyServer } = require('../dist-electron/shared/volcProxyCore')
function response(raw, flags=0) {
 const payload=Buffer.from(pako.gzip(Buffer.from(JSON.stringify(raw)))), length=Buffer.alloc(4);length.writeUInt32BE(payload.length)
 return Buffer.concat([Buffer.from([0x11,0x90|flags,0x11,0]),length,payload])
}
function setup() {
 const server=new EventEmitter();attachVolcProxyServer(server)
 const client=new FakeSocket();server.emit('connection',client)
 client.emit('message',Buffer.from(JSON.stringify({type:'start',config:{apiKey:'synthetic-secret'}})),false)
 const upstream=FakeSocket.instances.at(-1);upstream.emit('open')
 return {client,upstream}
}
{
 const {client,upstream}=setup()
 assert.equal(upstream.url,'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async')
 assert.equal(upstream.options.headers['X-Api-Key'],'synthetic-secret')
 assert.equal(upstream.options.headers['X-Api-Resource-Id'],'volc.seedasr.sauc.duration')
 const init=JSON.parse(Buffer.from(pako.ungzip(upstream.sent[0].subarray(8))).toString())
 assert.equal(init.request.enable_speaker_info,true);assert.equal(init.request.result_type,'full')
 // A PCM payload beginning with "{" is still binary audio.
 client.emit('message',Buffer.from('{not-json-but-pcm'),true)
 assert.equal(upstream.sent[1][1],0x20)
 const raw={result:{text:'synthetic',utterances:[{text:'synthetic',definite:false,start_time:0,end_time:100}]}}
 upstream.emit('message',response(raw))
 assert.deepEqual(JSON.parse(client.sent[1]).raw,raw)
 client.emit('message',Buffer.from('{"type":"audio_end"}'),false)
 client.emit('message',Buffer.from('{"type":"audio_end"}'),false)
 assert.equal(upstream.sent.filter(frame=>frame[1]===0x22).length,1)
 upstream.emit('message',response(raw,2))
 assert.equal(JSON.parse(client.sent.at(-1)).final,true)
 client.close();assert.equal(upstream.readyState,3)
}
{
 const {client,upstream}=setup()
 upstream.emit('message',Buffer.from([0,1]))
 const error=JSON.parse(client.sent.at(-1))
 assert.equal(error.code,'PROTOCOL_ERROR');assert.equal(client.readyState,3)
 assert(!JSON.stringify(client.sent).includes('synthetic-secret'))
}
console.log(JSON.stringify({status:'PASS',checks:['authentication message only','real 2.0 request','binary audio discrimination','structured response forwarding','single end marker','final without sequence','protocol failure closes explicitly'],source:'synthetic in-memory transport, no cloud calls'}))

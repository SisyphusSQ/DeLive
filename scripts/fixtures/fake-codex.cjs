#!/usr/bin/env node
// Protocol fixture: never touches the user's Codex home or network.
const readline = require('node:readline')
if (process.argv.includes('--version')) { console.log('codex-cli 0.156.0'); process.exit(0) }
const send = message => process.stdout.write(JSON.stringify(message) + '\n')
let model
readline.createInterface({ input: process.stdin }).on('line', line => {
  const { id, method, params } = JSON.parse(line)
  if (!method || id === undefined) return
  if (method === 'initialize') return send({ id, result: {} })
  if (method === 'config/read') return send({ id, result: { config: {
    features: Object.fromEntries(process.argv.filter(a => /^features\..+=false$/.test(a)).map(a => [a.slice(9, -6), false])),
    mcp_servers: { private: { enabled: true } },
    model_catalog_json: process.env.DELIVE_FIXTURE_CATALOG,
  } } })
  if (method === 'account/read') return send({ id, result: { account: { type: 'apiKey' } } })
  if (method === 'model/list') return send({ id, result: { data: [{ id: 'ok', model: 'ok', inputModalities: ['text', 'image'] }], nextCursor: null } })
  if (method === 'thread/start') {
    model = params.model
    if (!params.ephemeral || params.config['mcp_servers.private.enabled'] !== false) process.exit(3)
    return send({ id, result: { thread: { id: 'fixture-thread' }, sandbox: { type: model === 'unsafe' ? 'dangerFullAccess' : 'readOnly' }, approvalPolicy: 'never' } })
  }
  if (method === 'turn/start') {
    send({ id, result: { turn: { id: 'turn' } } })
    const notify = (method, params) => send({ method, params: { threadId: 'fixture-thread', ...params } })
    if (model === 'exit') return process.exit(7)
    if (model === 'pending') return
    if (model === 'permission') return send({ id: 99, method: 'item/commandExecution/requestApproval', params: {} })
    if (model === 'tool') return notify('item/started', { item: { type: 'fileChange' } })
    if (model === 'malformed') return process.stdout.write('not json\n')
    if (model === 'failed') return notify('turn/completed', { turn: { status: 'failed', error: { message: 'quota exceeded' } } })
    notify('item/agentMessage/delta', { delta: '已完成' })
    notify('turn/completed', { turn: { status: 'completed' } })
  }
})

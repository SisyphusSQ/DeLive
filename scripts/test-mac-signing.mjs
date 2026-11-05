import assert from 'node:assert/strict';
import afterPack, { resolveMacSigningIdentity } from './fix-mac-signing.mjs';

const hash = 'A'.repeat(40);
const development = `  1) ${hash} "Apple Development: Fixture (TEAM)"\n     1 valid identities found`;
const distribution = development.replace('Apple Development:', 'Developer ID Application:');
assert.throws(() => resolveMacSigningIdentity({}, development), /Developer ID Application/);
assert.equal(resolveMacSigningIdentity({}, distribution), hash);
assert.equal(resolveMacSigningIdentity({}, development + '\n' + distribution), hash);
assert.throws(() => resolveMacSigningIdentity({}, distribution.replace('"\n', '" (CSSMERR_TP_CERT_REVOKED)\n')), /稳定/);
assert.equal(resolveMacSigningIdentity({ DELIVE_MAC_SIGN_IDENTITY: 'chosen' }, development), 'chosen');
assert.throws(() => resolveMacSigningIdentity({}), /稳定/);
assert.throws(() => resolveMacSigningIdentity({}, distribution + '\n' + distribution), /稳定/);
assert.throws(() => resolveMacSigningIdentity({ DELIVE_MAC_SIGN_IDENTITY: '-' }), /临时签名/);
assert.equal(resolveMacSigningIdentity({ DELIVE_ALLOW_ADHOC: '1' }, development), '-');
assert.equal(resolveMacSigningIdentity({ DELIVE_ALLOW_ADHOC: '1', DELIVE_MAC_SIGN_IDENTITY: 'chosen' }), 'chosen');
await afterPack({ electronPlatformName: 'win32' });
console.log('PASS: Developer ID selection, revoked/ambiguous rejection and explicit ad-hoc opt-in');

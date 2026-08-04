import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePasswd, selectNonRootIdentity } from '../src/runtime/identity.js';

const fixture = [
  'root:x:0:0:root:/root:/bin/bash',
  'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin',
  'builder:x:1000:1000::/home/builder:/bin/bash',
  'nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin',
].join('\n');

test('selects a regular non-root browser identity', () => {
  const entries = parsePasswd(fixture);
  assert.deepEqual(selectNonRootIdentity(entries), {
    name: 'builder', uid: 1000, gid: 1000, home: '/home/builder', shell: '/bin/bash',
  });
});

test('honors an explicitly configured browser identity', () => {
  const entries = parsePasswd(fixture);
  assert.equal(selectNonRootIdentity(entries, 'builder').uid, 1000);
  assert.throws(() => selectNonRootIdentity(entries, 'missing'), /does not exist/);
  assert.throws(() => selectNonRootIdentity(entries, 'root'), /must not be root/);
});

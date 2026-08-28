import assert from 'node:assert/strict';
import { isMissingRemoteSession, signOutWithRecovery } from '../src/lib/authSignOut.ts';

type Reply = { error: { code?: string; message?: string } | null };

function authWith(replies: Reply[]) {
  const calls: string[] = [];
  return {
    auth: {
      async signOut({ scope }: { scope: 'global' | 'local' }) {
        calls.push(scope);
        const reply = replies.shift();
        if (!reply) throw new Error('unexpected signOut call');
        return reply;
      },
    },
    calls,
  };
}

const missingSession = { error: { code: 'session_not_found', message: 'Session from session_id claim in JWT does not exist' } };
assert.equal(isMissingRemoteSession(missingSession.error), true);
assert.equal(isMissingRemoteSession({ code: 'unexpected_error', message: 'database unavailable' }), false);

{
  const { auth, calls } = authWith([{ error: null }]);
  let cleared = false;
  const outcome = await signOutWithRecovery(auth, () => { cleared = true; });
  assert.equal(outcome, 'signed-out');
  assert.deepEqual(calls, ['global']);
  assert.equal(cleared, false);
}

{
  const { auth, calls } = authWith([missingSession, missingSession]);
  let cleared = false;
  const outcome = await signOutWithRecovery(auth, () => { cleared = true; });
  assert.equal(outcome, 'recovered-stale-session');
  assert.deepEqual(calls, ['global', 'local']);
  assert.equal(cleared, true, 'a revoked remote session must clear browser auth storage');
}

{
  const { auth } = authWith([{ error: { code: 'unexpected_error', message: 'database unavailable' } }]);
  await assert.rejects(
    () => signOutWithRecovery(auth, () => {}),
    (error: { message?: string }) => error.message === 'database unavailable',
  );
}

{
  const { auth } = authWith([missingSession, { error: { code: 'unexpected_error', message: 'network failure' } }]);
  await assert.rejects(
    () => signOutWithRecovery(auth, () => {}),
    (error: { message?: string }) => error.message === 'network failure',
  );
}

console.log('Auth sign-out fallback tests passed: normal logout, stale remote session recovery, and fatal-error propagation.');

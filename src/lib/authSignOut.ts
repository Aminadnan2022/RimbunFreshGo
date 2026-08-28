type SignOutScope = 'global' | 'local';

type SignOutResult = {
  error: unknown | null;
};

export interface AuthSignOutClient {
  signOut(options: { scope: SignOutScope }): Promise<SignOutResult>;
}

/**
 * GoTrue returns this when a browser still has a session token after that
 * session has already been revoked remotely. In that case the safe outcome is
 * to remove the stale browser copy; the server has already rejected it.
 */
export function isMissingRemoteSession(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const authError = error as { code?: unknown; name?: unknown };
  return authError.code === 'session_not_found' || authError.name === 'AuthSessionMissingError';
}

export async function signOutWithRecovery(
  auth: AuthSignOutClient,
  clearPersistedSession: () => void,
): Promise<'signed-out' | 'recovered-stale-session'> {
  let globalResult: SignOutResult;
  try {
    globalResult = await auth.signOut({ scope: 'global' });
  } catch (error) {
    if (!isMissingRemoteSession(error)) throw error;
    clearPersistedSession();
    return 'recovered-stale-session';
  }

  if (!globalResult.error) return 'signed-out';
  if (!isMissingRemoteSession(globalResult.error)) throw globalResult.error;

  // Use the SDK's supported local scope first. Current auth-js versions still
  // return session_not_found before clearing storage when GoTrue has already
  // revoked the session, so the narrowly scoped storage fallback below is
  // required for that one terminal state.
  let localResult: SignOutResult;
  try {
    localResult = await auth.signOut({ scope: 'local' });
  } catch (error) {
    if (!isMissingRemoteSession(error)) throw error;
    clearPersistedSession();
    return 'recovered-stale-session';
  }

  if (!localResult.error) return 'recovered-stale-session';
  if (!isMissingRemoteSession(localResult.error)) throw localResult.error;

  clearPersistedSession();
  return 'recovered-stale-session';
}

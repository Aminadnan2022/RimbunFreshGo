export type GuestAuthClient = {
  getSession: () => Promise<{
    data: { session: { user: { id: string } } | null };
  }>;
  signInAnonymously: (credentials?: {
    options?: { captchaToken?: string };
  }) => Promise<{
    data: { user: { id: string } | null };
    error: { message: string } | null;
  }>;
};

export class GuestCaptchaRequiredError extends Error {
  constructor() {
    super('Complete the security check before continuing.');
    this.name = 'GuestCaptchaRequiredError';
  }
}

export async function ensureGuestAuthIdentityWith(
  auth: GuestAuthClient,
  captchaConfigured: boolean,
  captchaToken?: string,
): Promise<string> {
  const { data: sessionData } = await auth.getSession();
  if (sessionData.session?.user.id) return sessionData.session.user.id;

  const normalizedToken = captchaToken?.trim();
  if (captchaConfigured && !normalizedToken) throw new GuestCaptchaRequiredError();

  const credentials = normalizedToken
    ? { options: { captchaToken: normalizedToken } }
    : undefined;
  const { data, error } = await auth.signInAnonymously(credentials);
  if (error || !data.user) {
    throw new Error(error?.message || 'Guest checkout is temporarily unavailable.');
  }
  return data.user.id;
}

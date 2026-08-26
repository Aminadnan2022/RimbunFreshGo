export type TransactionalNotification = {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  action_url: string | null;
};

const escapeHtml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

export function renderTransactionalEmail(notification: TransactionalNotification): { subject: string; html: string; text: string } {
  const subject = notification.title.slice(0, 140);
  const message = notification.message.slice(0, 1_000);
  const actionUrl = notification.action_url && notification.action_url.startsWith("/") ? notification.action_url : "/notifications";
  const text = `${subject}\n\n${message}\n\nView your FreshGo notification: ${actionUrl}`;
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f7f7f5;color:#18231b;font-family:Arial,sans-serif"><main style="max-width:600px;margin:0 auto;padding:32px 24px"><p style="margin:0 0 24px;font-weight:700;color:#167a46">FreshGo</p><h1 style="font-size:24px;line-height:1.25;margin:0 0 16px">${escapeHtml(subject)}</h1><p style="font-size:16px;line-height:1.6;margin:0 0 24px">${escapeHtml(message)}</p><p style="font-size:14px;line-height:1.5;margin:0;color:#526056">Open FreshGo to view your order updates.</p></main></body></html>`;
  return { subject, html, text };
}

export const retryAt = (attempt: number) => new Date(Date.now() + Math.min(30 * 60, 30 * 2 ** Math.max(0, attempt - 1)) * 1_000).toISOString();
export const isTransientProviderStatus = (status: number) => status === 408 || status === 429 || status >= 500;

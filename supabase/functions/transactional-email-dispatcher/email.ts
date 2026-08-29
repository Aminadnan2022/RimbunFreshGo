export const CUSTOMER_EMAIL_TYPES = ["order_payment_submitted", "price_finalised", "final_amount_updated", "payment_confirmed", "payment_receipt_rejected", "ready_for_delivery", "out_for_delivery", "order_delivered", "order_cancelled"] as const;
export type CustomerEmailType = typeof CUSTOMER_EMAIL_TYPES[number];
export type TransactionalNotification = { id: string; notification_type: string };
export type TransactionalEmailProjection = {
  notification_type: CustomerEmailType; order_number: string; previous_final_total: number | string | null; final_total: number | string | null;
  currency_code: string | null; payment_status: string | null; delivery_date: string | null;
  delivery_window: string | null; delivery_area: string | null;
};
type Template = { subject: string; heading: string; status: string; explanation: string; next: string; action?: string; cta: string };

const PROD = "https://app.freshgo.my";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const baseUrl = (configured?: string) => {
  if (!configured) return PROD;
  try {
    const url = new URL(configured);
    return url.origin === PROD || (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname)) ? url.origin : PROD;
  } catch { return PROD; }
};
const orderUrl = (order: string, configured?: string) => `${baseUrl(configured)}/order/${encodeURIComponent(order)}`;

const T: Record<CustomerEmailType, Template> = {
  order_payment_submitted: { subject: "Order received — {order}", heading: "We received your order", status: "Receipt awaiting verification", explanation: "Your order and payment receipt have been received. Our team still needs to verify the receipt, so payment is not confirmed yet.", next: "We will notify you after the receipt has been checked.", cta: "View order" },
  price_finalised: { subject: "Final amount ready — {order}", heading: "Your final amount is ready", status: "Payment required", explanation: "Your order has been weighed and the final payable amount is ready.", next: "Complete payment and upload your receipt in FreshGo.", action: "Please pay the final amount and upload your payment receipt.", cta: "Pay and view order" },
  final_amount_updated: { subject: "Order amount updated — {order}", heading: "Your order amount was updated", status: "Payment amount updated", explanation: "A corrected weight changed the final payable amount for your order.", next: "Review the new amount, then complete payment and upload your receipt in FreshGo.", action: "Please pay the updated final amount and upload your payment receipt.", cta: "Pay and view order" },
  payment_confirmed: { subject: "Payment confirmed — {order}", heading: "Your payment is confirmed", status: "Payment confirmed", explanation: "We have verified your payment for this order.", next: "FreshGo will prepare your order and keep you updated as it moves towards delivery.", cta: "View order" },
  payment_receipt_rejected: { subject: "Replacement receipt needed — {order}", heading: "Your receipt needs attention", status: "Receipt not accepted", explanation: "We could not accept the payment receipt submitted for this order.", next: "Upload a clear replacement receipt so our team can verify your payment.", action: "Please upload a replacement payment receipt.", cta: "Upload replacement receipt" },
  ready_for_delivery: { subject: "Ready for delivery — {order}", heading: "Your order is ready for delivery", status: "Ready for delivery", explanation: "Your order has been prepared and is ready for the delivery stage.", next: "We will notify you when your order is on the way.", cta: "View delivery update" },
  out_for_delivery: { subject: "Out for delivery — {order}", heading: "Your order is on the way", status: "Out for delivery", explanation: "Your FreshGo order is now out for delivery.", next: "Please be ready to receive it at your selected delivery point or area.", cta: "Track order" },
  order_delivered: { subject: "Order delivered — {order}", heading: "Your order has been delivered", status: "Delivered", explanation: "FreshGo has recorded this order as delivered. Thank you for choosing us.", next: "Open the order page to review its delivery details.", cta: "View delivered order" },
  order_cancelled: { subject: "Order cancelled — {order}", heading: "Your order has been cancelled", status: "Cancelled", explanation: "This order has been cancelled.", next: "Open the order page for the latest recorded details. This email does not confirm any refund status.", cta: "View order" },
};

const paymentLabel = (type: CustomerEmailType, status: string | null) => type === "order_payment_submitted" ? "Awaiting receipt verification" : type === "price_finalised" || type === "final_amount_updated" ? "Payment required" : type === "payment_confirmed" || status === "paid" ? "Confirmed" : type === "payment_receipt_rejected" ? "Replacement receipt required" : null;
const amountLabel = (value: number | string | null, currency: string | null) => {
  const amount = typeof value === "number" ? value : value === null || value === "" ? NaN : Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return new Intl.NumberFormat("en-MY", { style: "currency", currency: currency === "MYR" ? currency : "MYR" }).format(amount);
};
const dateLabel = (value: string | null) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00+08:00`);
  return Number.isNaN(date.valueOf()) ? null : new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(date);
};

export function renderTransactionalEmail(notification: TransactionalNotification, data: TransactionalEmailProjection, options: { appBaseUrl?: string } = {}) {
  if (!CUSTOMER_EMAIL_TYPES.includes(notification.notification_type as CustomerEmailType)) throw new Error("Unsupported customer transactional email type");
  if (data.notification_type !== notification.notification_type) throw new Error("Transactional email projection type mismatch");
  const type = notification.notification_type as CustomerEmailType;
  const order = data.order_number.trim().slice(0, 80);
  if (!order) throw new Error("Transactional email order number is unavailable");
  const template = T[type]; const subject = template.subject.replace("{order}", order).slice(0, 140); const url = orderUrl(order, options.appBaseUrl);
  const amount = type === "price_finalised" || type === "final_amount_updated" || type === "payment_confirmed" ? amountLabel(data.final_total, data.currency_code) : null;
  const previousAmount = type === "final_amount_updated" ? amountLabel(data.previous_final_total, data.currency_code) : null;
  const payment = paymentLabel(type, data.payment_status); const delivery = ["ready_for_delivery", "out_for_delivery", "order_delivered"].includes(type);
  const rows: string[][] = [["Order", order], ...(payment ? [["Payment", payment]] : []), ...(previousAmount ? [["Previous amount", previousAmount]] : []), ...(amount ? [[type === "payment_confirmed" ? "Amount paid" : type === "final_amount_updated" ? "Updated final amount" : "Final amount", amount]] : []), ...(delivery && dateLabel(data.delivery_date) ? [["Delivery date", dateLabel(data.delivery_date)!]] : []), ...(delivery && data.delivery_window ? [["Delivery window", data.delivery_window.slice(0, 80)]] : []), ...(delivery && data.delivery_area ? [["Delivery area / point", data.delivery_area.slice(0, 120)]] : [])];
  const rowHtml = rows.map(([k, v]) => `<tr><td style="padding:8px 12px;color:#526056;font-size:14px">${esc(k)}</td><td style="padding:8px 12px;color:#18231b;font-size:14px;font-weight:700;text-align:right">${esc(v)}</td></tr>`).join("");
  const action = template.action ? `<div style="margin-top:22px;padding:14px 16px;border-left:4px solid #e6a700;background:#fff8dc"><strong>Action required</strong><br>${esc(template.action)}</div>` : "";
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f7f4;color:#18231b;font-family:Arial,sans-serif"><main style="max-width:600px;margin:0 auto;padding:20px 12px"><section style="background:#fff;border:1px solid #dfe8e1;border-radius:16px;overflow:hidden"><div style="padding:20px 24px;background:#167a46;color:#fff;font-size:22px;font-weight:800">FreshGo</div><div style="padding:24px"><p style="margin:0 0 8px;color:#167a46;font-size:14px;font-weight:700;text-transform:uppercase">${esc(template.status)}</p><h1 style="margin:0 0 14px;font-size:26px;line-height:1.25">${esc(template.heading)}</h1><p style="margin:0 0 20px;font-size:16px;line-height:1.6">${esc(template.explanation)}</p><table role="presentation" style="width:100%;border-collapse:collapse;background:#f4f7f4">${rowHtml}</table><h2 style="margin:24px 0 8px;font-size:18px">What happens next?</h2><p style="margin:0;font-size:15px;line-height:1.6">${esc(template.next)}</p>${action}<p style="margin:24px 0 8px"><a href="${esc(url)}" style="display:inline-block;background:#167a46;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:9px">${esc(template.cta)}</a></p><p style="margin:0;font-size:13px;color:#526056">If the button does not work, open: <a href="${esc(url)}" style="color:#167a46;word-break:break-all">${esc(url)}</a></p></div><footer style="padding:18px 24px;background:#f4f7f4;color:#526056;font-size:12px;line-height:1.6">Need help? View your order in FreshGo for the latest information.<br>FreshGo will never ask for your password or OTP by email.</footer></section></main></body></html>`;
  const details = rows.map(([k, v]) => `${k}: ${v}`).join("\n");
  const text = `FreshGo\n\n${template.heading}\n${template.status}\n\n${template.explanation}\n\n${details}\n\nWhat happens next?\n${template.next}${template.action ? `\n\nACTION REQUIRED\n${template.action}` : ""}\n\n${template.cta}: ${url}\n\nNeed help? View your order in FreshGo for the latest information.\nFreshGo will never ask for your password or OTP by email.`;
  return { subject, html, text };
}

export const retryAt = (attempt: number) => new Date(Date.now() + Math.min(30 * 60, 30 * 2 ** Math.max(0, attempt - 1)) * 1_000).toISOString();
export const isTransientProviderStatus = (status: number) => status === 408 || status === 429 || status >= 500;

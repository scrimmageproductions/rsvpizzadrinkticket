import "server-only";

export type OutboundEmail = { to: string; subject: string; text: string; html: string };

/**
 * Abstract transactional email sender used by the pre-arrival link route.
 * Returns true when the message was handed off to a provider.
 */
export async function sendEmail(msg: OutboundEmail): Promise<boolean> {
  // TODO: Implement preferred transactional email provider here (Resend, SendGrid, Postmark, SES…).
  //   e.g. Resend:
  //   const resend = new Resend(process.env.RESEND_API_KEY);
  //   const { error } = await resend.emails.send({ from: "rsv.pizza <door@rsv.pizza>", ...msg });
  //   return !error;
  console.info(`[email:not-sent] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
  return false;
}

export function preArrivalEmail(p: { name: string; eventName: string; venue: string | null; link: string }): Omit<OutboundEmail, "to"> {
  const first = p.name.split(" ")[0];
  const subject = `Your tickets for ${p.eventName} 🍕`;
  const text = `Hey ${first}!\n\nTap this before you head to ${p.venue ?? "the party"} so you skip the line at the door:\n${p.link}\n\nIt logs you in with this email and sets up your drink tickets. Once inside, enter the PIN from the sign.\n\n— rsv.pizza`;
  const html = `<p>Hey ${escapeHtml(first)}!</p><p>Tap this before you head to ${escapeHtml(p.venue ?? "the party")} so you skip the line at the door:</p><p><a href="${p.link}" style="display:inline-block;padding:14px 22px;background:#FF4D1C;color:#000;font-weight:700;text-decoration:none">Get my tickets ready →</a></p><p>Once inside, enter the PIN from the sign.</p><p>— rsv.pizza</p>`;
  return { subject, text, html };
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

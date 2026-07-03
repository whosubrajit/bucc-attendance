/**
 * Email notifications via Resend. Fully optional: when RESEND_API_KEY is
 * unset every call is a silent no-op, so local dev needs no email setup.
 */
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function sendEmail(to: string | string[], subject: string, html: string): Promise<void> {
  if (!resend) return;
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "BUCC Attendance <onboarding@resend.dev>",
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    });
  } catch (err) {
    // Email is best-effort — never fail the request because of it.
    console.error("[email] send failed:", err);
  }
}

export function emailLayout(title: string, body: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
    <h2 style="color:#0e1e3f">${title}</h2>
    <div style="color:#334155;line-height:1.6">${body}</div>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px">BUCC Attendance System — automated message</p>
  </div>`;
}

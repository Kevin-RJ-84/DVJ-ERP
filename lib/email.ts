import nodemailer from "nodemailer";
import { Resend } from "resend";

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type SendEmailResult =
  | { sent: true }
  | { sent: false; reason: string };

function hasSmtpConfig() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_FROM,
  );
}

function hasResendConfig() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (hasResendConfig()) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM as string,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });

    if (result.error) {
      console.warn("Resend email failed:", result.error.message, { to: input.to });
      return { sent: false, reason: result.error.message };
    }
    return { sent: true };
  }

  if (hasSmtpConfig()) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
      return { sent: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "SMTP send failed.";
      console.warn("SMTP email failed:", reason, { to: input.to });
      return { sent: false, reason };
    }
  }

  console.warn("Email provider is not configured. Email skipped:", input);
  return { sent: false, reason: "Email provider is not configured." };
}

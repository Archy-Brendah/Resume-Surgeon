import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Resume Surgeon <onboarding@resend.dev>";
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
  "http://localhost:3000";
const DASHBOARD_URL = `${APP_URL.replace(/\/$/, "")}`;
const LINKEDIN_BANNER_URL = `${APP_URL.replace(/\/$/, "")}?tab=linkedin`;

const TIPS = [
  "Apply within the first 48 hours of a posting — early applicants get more callbacks.",
  "Tailor your resume to each role using the Surgical Matcher so ATS and recruiters see a clear fit.",
  "Use your new LinkedIn Surgeon content and banner to stand out in search and on your profile.",
];

function buildSuccessEmailHtml(name: string): string {
  const displayName = name?.trim() || "there";
  const tipsHtml = TIPS.map((tip) => `<li style="margin-bottom: 10px; line-height: 1.5;">${tip}</li>`).join("");
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Surgery Complete</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: Inter, system-ui, -apple-system, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f172a; min-height: 100vh;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" style="max-width: 560px;">
          <tr>
            <td style="padding: 32px 24px; background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(45, 212, 191, 0.25); border-radius: 16px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <span style="font-size: 20px; font-weight: 700; color: #2dd4bf; letter-spacing: 0.05em;">RESUME SURGEON</span>
              </div>
              <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #f1f5f9;">
                Surgery complete
              </h1>
              <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #94a3b8;">
                Hello ${displayName}, your career surgery was successful. Your account has been upgraded to the <strong style="color: #2dd4bf;">Executive Pass</strong>.
              </p>
              <p style="margin: 0 0 12px; font-size: 13px; font-weight: 600; color: #cbd5e1;">Three tips for your job hunt:</p>
              <ul style="margin: 0 0 24px; padding-left: 20px; color: #94a3b8; font-size: 14px;">
                ${tipsHtml}
              </ul>
              <p style="margin: 0 0 24px; font-size: 13px; color: #64748b;">
                <a href="${LINKEDIN_BANNER_URL}" style="color: #2dd4bf;">Get your LinkedIn Banner</a> and welcome guide in the app.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="${DASHBOARD_URL}" style="display: inline-block; padding: 14px 28px; background: #2dd4bf; color: #0f172a; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">Access Your Executive Dashboard</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 24px 0 0; font-size: 12px; color: #475569;">
                You received this email because your payment for Resume Surgeon was completed.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export const SUCCESS_EMAIL_SUBJECT = "Surgery Complete: Your Executive Suite is Ready ⚡";

/**
 * Sends the Divine Success Email after payment is verified.
 * Logs errors and does not throw so the webhook can still return 200.
 */
export async function sendSuccessEmail(to: string, name: string): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    console.warn("[Success Email] RESEND_API_KEY not set; skipping email.");
    return { ok: false, error: "RESEND_API_KEY not set" };
  }

  const email = to?.trim();
  if (!email) {
    return { ok: false, error: "No recipient email" };
  }

  try {
    const resend = new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [email],
      subject: SUCCESS_EMAIL_SUBJECT,
      html: buildSuccessEmailHtml(name || "there"),
    });

    if (error) {
      console.error("[Success Email] Resend error:", error);
      return { ok: false, error: String(error.message ?? error) };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Success Email] Send failed:", message);
    return { ok: false, error: message };
  }
}

const nodemailer = require("nodemailer");

function getInviteTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

async function sendOrganizationInviteEmail({ to, organizationName, inviteLink }) {
  const transporter = getInviteTransporter();
  if (!transporter) {
    console.warn("Invite email skipped: SMTP is not configured.");
    return {
      delivered: false,
      skipped: true,
      message: "SMTP is not configured.",
    };
  }

  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject: `You're invited to join ${organizationName} on LeakShield`,
      text: [
        `You have been invited to join ${organizationName} on LeakShield.`,
        "",
        "Use the link below to set your password and activate your account:",
        inviteLink,
        "",
        "If you were not expecting this invite, you can ignore this email.",
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
          <h2 style="margin-bottom:8px;">LeakShield Invitation</h2>
          <p>You have been invited to join <strong>${organizationName}</strong>.</p>
          <p style="margin:16px 0;">
            <a href="${inviteLink}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;">
              Set Password & Join Team
            </a>
          </p>
          <p>If the button does not work, copy this link into your browser:</p>
          <p style="word-break:break-all;color:#334155;">${inviteLink}</p>
          <p>If you were not expecting this invite, you can safely ignore this email.</p>
        </div>
      `,
    });

    return {
      delivered: true,
      skipped: false,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error("Failed to send organization invite email:", error.message);
    return {
      delivered: false,
      skipped: false,
      message: error.message,
    };
  }
}

module.exports = {
  sendOrganizationInviteEmail,
};

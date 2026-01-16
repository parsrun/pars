/**
 * Email Verification Template
 */

interface VerificationTemplateOptions {
  verificationUrl: string;
  userName?: string;
  expiresInHours: number;
  appName: string;
}

/**
 * Generate verification email HTML
 */
export function generateVerificationEmailHTML(options: VerificationTemplateOptions): string {
  const { verificationUrl, userName, expiresInHours, appName } = options;
  const greeting = userName ? `Hi ${userName}` : 'Hello';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07); overflow: hidden;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-align: center; padding: 40px 20px;">
        <h1 style="margin: 0; font-size: 24px; font-weight: 600;">${appName}</h1>
        <p style="margin: 10px 0 0; opacity: 0.9;">Email Verification</p>
      </div>

      <!-- Content -->
      <div style="padding: 40px 30px;">
        <p style="font-size: 16px; margin-bottom: 20px;">${greeting},</p>
        <p style="color: #4a5568;">Please verify your email address by clicking the button below:</p>

        <!-- Button -->
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
            Verify Email Address
          </a>
        </div>

        <!-- Expiry Notice -->
        <div style="background: #fef7e0; border: 1px solid #f6e05e; border-radius: 8px; padding: 12px; margin: 20px 0; color: #744210; text-align: center;">
          ⏱️ This link expires in ${expiresInHours} hour${expiresInHours > 1 ? 's' : ''}
        </div>

        <!-- Alternative Link -->
        <p style="color: #718096; font-size: 14px; margin-top: 20px;">
          If the button doesn't work, copy and paste this link into your browser:
        </p>
        <p style="background: #f7fafc; padding: 12px; border-radius: 6px; word-break: break-all; font-size: 12px; color: #4a5568;">
          ${verificationUrl}
        </p>

        <p style="color: #718096; font-size: 14px; margin-top: 30px;">
          If you didn't create an account, you can safely ignore this email.
        </p>
      </div>

      <!-- Footer -->
      <div style="background: #f7fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="color: #a0aec0; font-size: 12px; margin: 0;">
          &copy; ${new Date().getFullYear()} ${appName}. All rights reserved.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
`;
}

/**
 * Generate verification email plain text
 */
export function generateVerificationEmailText(options: VerificationTemplateOptions): string {
  const { verificationUrl, userName, expiresInHours, appName } = options;
  const greeting = userName ? `Hi ${userName}` : 'Hello';

  return `${greeting},

Please verify your email address by clicking the link below:

${verificationUrl}

This link expires in ${expiresInHours} hour${expiresInHours > 1 ? 's' : ''}.

If you didn't create an account, you can safely ignore this email.

- The ${appName} Team`;
}

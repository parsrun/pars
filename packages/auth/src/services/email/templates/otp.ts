/**
 * OTP Email Template
 */

interface OTPTemplateOptions {
  code: string;
  expiresInMinutes: number;
  userName?: string;
  appName: string;
}

/**
 * Generate OTP email HTML
 */
export function generateOTPEmailHTML(options: OTPTemplateOptions): string {
  const { code, expiresInMinutes, userName, appName } = options;
  const greeting = userName ? `Hi ${userName}` : 'Hello';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Verification Code</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07); overflow: hidden;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-align: center; padding: 40px 20px;">
        <h1 style="margin: 0; font-size: 24px; font-weight: 600;">${appName}</h1>
        <p style="margin: 10px 0 0; opacity: 0.9;">Verification Code</p>
      </div>

      <!-- Content -->
      <div style="padding: 40px 30px;">
        <p style="font-size: 16px; margin-bottom: 20px;">${greeting},</p>
        <p style="color: #4a5568;">Use the following code to verify your identity:</p>

        <!-- Code Box -->
        <div style="text-align: center; margin: 30px 0;">
          <div style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border: 2px dashed #cbd5e0; border-radius: 12px; padding: 25px; display: inline-block;">
            <span style="font-size: 36px; font-weight: 700; color: #4c51bf; letter-spacing: 8px; font-family: 'Monaco', 'Menlo', monospace;">
              ${code}
            </span>
          </div>
        </div>

        <!-- Expiry Warning -->
        <div style="background: #fef7e0; border: 1px solid #f6e05e; border-radius: 8px; padding: 12px; margin: 20px 0; color: #744210; text-align: center; font-weight: 500;">
          ⏱️ This code expires in ${expiresInMinutes} minutes
        </div>

        <!-- Security Notice -->
        <div style="background: #fed7d7; border: 1px solid #fc8181; border-radius: 8px; padding: 12px; margin: 20px 0; color: #c53030; font-size: 14px;">
          🔒 Never share this code with anyone. ${appName} will never ask for your code.
        </div>

        <p style="color: #718096; font-size: 14px; margin-top: 30px;">
          If you didn't request this code, you can safely ignore this email.
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
 * Generate OTP email plain text
 */
export function generateOTPEmailText(options: OTPTemplateOptions): string {
  const { code, expiresInMinutes, userName, appName } = options;
  const greeting = userName ? `Hi ${userName}` : 'Hello';

  return `${greeting},

Your ${appName} verification code is: ${code}

This code expires in ${expiresInMinutes} minutes.

Never share this code with anyone. ${appName} will never ask for your code.

If you didn't request this code, you can safely ignore this email.

- The ${appName} Team`;
}

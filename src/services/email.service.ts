import { config } from "../config";
import { Resend } from "resend";

class EmailService {
  private resend: Resend;

  constructor() {
    this.resend = new Resend(config.RESEND_API_KEY);
  }

  async sendVerificationEmail(email: string, name: string, token: string) {
    const verificationUrl = `${config.FRONTEND_URL}/verify-email?token=${token}`;

    try {
      const { data, error } = await this.resend.emails.send({
        from: config.EMAIL_FROM,
        to: [email],
        subject: "Verify your Bookworm account",
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 700;">📚 Bookworm</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 16px;">Your reading companion</p>
            </div>
            
            <div style="padding: 40px 30px; background: #ffffff; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
              <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px; font-weight: 600;">Welcome to our community!</h2>
              <p style="color: #4b5563; line-height: 1.6; margin: 0 0 30px 0; font-size: 16px;">
                Hello <strong>${name}</strong>,<br><br>
                Thank you for joining Bookworm! We're excited to have you in our community of book lovers. To get started, please verify your email address by clicking the button below.
              </p>
              
              <div style="text-align: center; margin: 40px 0;">
                <a href="${verificationUrl}" 
                   style="display: inline-block; 
                          padding: 16px 32px; 
                          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                          color: white; 
                          text-decoration: none; 
                          border-radius: 8px; 
                          font-weight: 600;
                          font-size: 16px;
                          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                          transition: all 0.2s ease;">
                  Verify Email Address
                </a>
              </div>
              
              <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 30px 0;">
                <p style="color: #6b7280; font-size: 14px; line-height: 1.5; margin: 0;">
                  <strong>Having trouble with the button?</strong><br>
                  Copy and paste this link into your browser:<br>
                  <a href="${verificationUrl}" style="color: #667eea; word-break: break-all; text-decoration: none;">
                    ${verificationUrl}
                  </a>
                </p>
              </div>
              
              <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 40px;">
                <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
                  This verification link will expire in 24 hours.<br>
                  If you didn't create an account, you can safely ignore this email.
                </p>
              </div>
            </div>
          </div>
        `,
      });

      if (error) {
        console.error("Resend verification email error:", error);
        throw new Error("Failed to send verification email");
      }

      console.log("Verification email sent:", data?.id);
    } catch (error) {
      console.error("Email service error:", error);
      throw error;
    }
  }

  async sendPasswordResetEmail(email: string, name: string, token: string) {
    const resetUrl = `${config.FRONTEND_URL}/reset-password?token=${token}`;

    try {
      const { data, error } = await this.resend.emails.send({
        from: config.EMAIL_FROM,
        to: [email],
        subject: "Reset your Bookworm password",
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;">
            <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 700;">🔒 Password Reset</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 16px;">Secure your account</p>
            </div>
            
            <div style="padding: 40px 30px; background: #ffffff; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
              <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px; font-weight: 600;">Reset Your Password</h2>
              <p style="color: #4b5563; line-height: 1.6; margin: 0 0 30px 0; font-size: 16px;">
                Hello <strong>${name}</strong>,<br><br>
                We received a request to reset your password. Click the button below to create a new password for your Bookworm account.
              </p>
              
              <div style="text-align: center; margin: 40px 0;">
                <a href="${resetUrl}" 
                   style="display: inline-block; 
                          padding: 16px 32px; 
                          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); 
                          color: white; 
                          text-decoration: none; 
                          border-radius: 8px; 
                          font-weight: 600;
                          font-size: 16px;
                          box-shadow: 0 4px 12px rgba(245, 87, 108, 0.4);
                          transition: all 0.2s ease;">
                  Reset Password
                </a>
              </div>
              
              <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 20px; border-radius: 8px; margin: 30px 0;">
                <p style="color: #dc2626; font-size: 14px; line-height: 1.5; margin: 0;">
                  <strong>Security Notice:</strong><br>
                  If you didn't request this password reset, please ignore this email. Your account remains secure.
                </p>
              </div>
              
              <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 30px 0;">
                <p style="color: #6b7280; font-size: 14px; line-height: 1.5; margin: 0;">
                  <strong>Having trouble with the button?</strong><br>
                  Copy and paste this link into your browser:<br>
                  <a href="${resetUrl}" style="color: #f5576c; word-break: break-all; text-decoration: none;">
                    ${resetUrl}
                  </a>
                </p>
              </div>
              
              <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 40px;">
                <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
                  This reset link will expire in 1 hour for security purposes.
                </p>
              </div>
            </div>
          </div>
        `,
      });

      if (error) {
        console.error("Resend password reset email error:", error);
        throw new Error("Failed to send password reset email");
      }

      console.log("Password reset email sent:", data?.id);
    } catch (error) {
      console.error("Email service error:", error);
      throw error;
    }
  }

  async sendWelcomeEmail(email: string, name: string) {
    try {
      const { data, error } = await this.resend.emails.send({
        from: config.EMAIL_FROM,
        to: [email],
        subject: "Welcome to Bookworm! 📚",
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 700;">🎉 Welcome!</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 16px;">You're officially a Bookworm</p>
            </div>
            
            <div style="padding: 40px 30px; background: #ffffff; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
              <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px; font-weight: 600;">You're all set, ${name}!</h2>
              <p style="color: #4b5563; line-height: 1.6; margin: 0 0 30px 0; font-size: 16px;">
                Your email has been verified and your account is ready to use. Here's what you can do now:
              </p>
              
              <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); padding: 30px; border-radius: 12px; margin: 30px 0;">
                <div style="display: grid; gap: 16px;">
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 24px;">📖</span>
                    <span style="color: #0f172a; font-weight: 500;">Track your reading progress</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 24px;">🎯</span>
                    <span style="color: #0f172a; font-weight: 500;">Set annual reading goals</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 24px;">📍</span>
                    <span style="color: #0f172a; font-weight: 500;">Discover local book boxes</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 24px;">👥</span>
                    <span style="color: #0f172a; font-weight: 500;">Connect with other readers</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 24px;">⭐</span>
                    <span style="color: #0f172a; font-weight: 500;">Rate and review books</span>
                  </div>
                </div>
              </div>
              
              <div style="text-align: center; margin: 40px 0;">
                <a href="${config.FRONTEND_URL}" 
                   style="display: inline-block; 
                          padding: 16px 32px; 
                          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                          color: white; 
                          text-decoration: none; 
                          border-radius: 8px; 
                          font-weight: 600;
                          font-size: 16px;
                          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                          transition: all 0.2s ease;">
                  Start Your Reading Journey
                </a>
              </div>
              
              <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 40px; text-align: center;">
                <p style="color: #6b7280; font-size: 14px; margin: 0 0 10px 0;">
                  Happy reading! 📚
                </p>
                <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                  The Bookworm Team
                </p>
              </div>
            </div>
          </div>
        `,
      });

      if (error) {
        console.error("Resend welcome email error:", error);
        throw new Error("Failed to send welcome email");
      }

      console.log("Welcome email sent:", data?.id);
    } catch (error) {
      console.error("Email service error:", error);
      throw error;
    }
  }
}

export const emailService = new EmailService();

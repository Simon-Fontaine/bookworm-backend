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

  /**
   * Send reading milestone email
   */
  async sendMilestoneEmail(
    email: string,
    name: string,
    milestone: {
      type: "books_read" | "reading_goal" | "reading_streak";
      value: number;
      year?: number;
    },
  ) {
    let subject = "";
    let content = "";

    switch (milestone.type) {
      case "books_read":
        subject = `🎉 You've read ${milestone.value} books!`;
        content = `Congratulations on reading ${milestone.value} books! Your reading journey is inspiring.`;
        break;
      case "reading_goal":
        subject = `🎯 Reading goal achieved!`;
        content = `Amazing! You've reached your ${milestone.year} reading goal of ${milestone.value} books.`;
        break;
      case "reading_streak":
        subject = `🔥 ${milestone.value} day reading streak!`;
        content = `Keep it up! You've maintained a ${milestone.value} day reading streak.`;
        break;
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: config.EMAIL_FROM,
        to: [email],
        subject,
        html: this.createMilestoneEmailTemplate(name, content, milestone),
      });

      if (error) {
        console.error("Milestone email error:", error);
        throw new Error("Failed to send milestone email");
      }

      console.log("Milestone email sent:", data?.id);
    } catch (error) {
      console.error("Email service error:", error);
      throw error;
    }
  }

  /**
   * Send book recommendation email
   */
  async sendRecommendationEmail(email: string, name: string, books: any[]) {
    try {
      const { data, error } = await this.resend.emails.send({
        from: config.EMAIL_FROM,
        to: [email],
        subject: "📚 New book recommendations for you!",
        html: this.createRecommendationEmailTemplate(name, books),
      });

      if (error) {
        console.error("Recommendation email error:", error);
        throw new Error("Failed to send recommendation email");
      }

      console.log("Recommendation email sent:", data?.id);
    } catch (error) {
      console.error("Email service error:", error);
      throw error;
    }
  }

  /**
   * Send reading reminder email
   */
  async sendReadingReminderEmail(email: string, name: string, streak: number) {
    try {
      const { data, error } = await this.resend.emails.send({
        from: config.EMAIL_FROM,
        to: [email],
        subject: "📖 Don't break your reading streak!",
        html: this.createReminderEmailTemplate(name, streak),
      });

      if (error) {
        console.error("Reminder email error:", error);
        throw new Error("Failed to send reminder email");
      }

      console.log("Reminder email sent:", data?.id);
    } catch (error) {
      console.error("Email service error:", error);
      throw error;
    }
  }

  private createMilestoneEmailTemplate(name: string, content: string, milestone: any): string {
    return `
      <div style="max-width: 600px; margin: 0 auto; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;">
        <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 700;">🎉 Milestone Achieved!</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 16px;">Your reading progress</p>
        </div>
        
        <div style="padding: 40px 30px; background: #ffffff; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px; font-weight: 600;">Congratulations, ${name}!</h2>
          <p style="color: #4b5563; line-height: 1.6; margin: 0 0 30px 0; font-size: 16px;">
            ${content}
          </p>
          
          <div style="text-align: center; margin: 40px 0;">
            <a href="${config.FRONTEND_URL}" 
               style="display: inline-block; 
                      padding: 16px 32px; 
                      background: linear-gradient(135deg, #10B981 0%, #059669 100%); 
                      color: white; 
                      text-decoration: none; 
                      border-radius: 8px; 
                      font-weight: 600;
                      font-size: 16px;
                      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);">
              Continue Reading
            </a>
          </div>
        </div>
      </div>
    `;
  }

  private createRecommendationEmailTemplate(name: string, books: any[]): string {
    const booksHtml = books
      .slice(0, 5)
      .map(
        (book) => `
      <div style="display: flex; margin-bottom: 20px; padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <img src="${book.thumbnailUrl || ""}" alt="${book.title}" style="width: 60px; height: 80px; object-fit: cover; border-radius: 4px; margin-right: 15px;">
        <div>
          <h4 style="margin: 0 0 5px 0; color: #1f2937;">${book.title}</h4>
          <p style="margin: 0 0 5px 0; color: #6b7280; font-size: 14px;">by ${book.authors?.join(", ") || "Unknown"}</p>
          <p style="margin: 0; color: #4b5563; font-size: 12px; line-height: 1.4;">${book.description?.substring(0, 100) || ""}...</p>
        </div>
      </div>
    `,
      )
      .join("");

    return `
      <div style="max-width: 600px; margin: 0 auto; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;">
        <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 700;">📚 Book Recommendations</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 16px;">Curated just for you</p>
        </div>
        
        <div style="padding: 40px 30px; background: #ffffff; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px; font-weight: 600;">Hello ${name}!</h2>
          <p style="color: #4b5563; line-height: 1.6; margin: 0 0 30px 0; font-size: 16px;">
            Based on your reading history, we think you'll love these books:
          </p>
          
          ${booksHtml}
          
          <div style="text-align: center; margin: 40px 0;">
<a href="${config.FRONTEND_URL}" 
               style="display: inline-block; 
                      padding: 16px 32px; 
                      background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); 
                      color: white; 
                      text-decoration: none; 
                      border-radius: 8px; 
                      font-weight: 600;
                      font-size: 16px;
                      box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);">
              Explore More Books
            </a>
          </div>
        </div>
      </div>
    `;
  }

  private createReminderEmailTemplate(name: string, streak: number): string {
    return `
      <div style="max-width: 600px; margin: 0 auto; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;">
        <div style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 700;">📖 Reading Reminder</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 16px;">Keep your streak alive</p>
        </div>
        
        <div style="padding: 40px 30px; background: #ffffff; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px; font-weight: 600;">Don't break your streak, ${name}!</h2>
          <p style="color: #4b5563; line-height: 1.6; margin: 0 0 30px 0; font-size: 16px;">
            You're on a ${streak}-day reading streak! 🔥 Take a few minutes today to continue your reading journey.
          </p>
          
          <div style="text-align: center; margin: 40px 0;">
            <a href="${config.FRONTEND_URL}" 
               style="display: inline-block; 
                      padding: 16px 32px; 
                      background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); 
                      color: white; 
                      text-decoration: none; 
                      border-radius: 8px; 
                      font-weight: 600;
                      font-size: 16px;
                      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);">
              Continue Reading
            </a>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Check service health
   */
  async checkHealth(): Promise<{ status: "healthy" | "unhealthy"; error?: string }> {
    try {
      // Simple health check - could expand to test actual email sending
      return { status: "healthy" };
    } catch (error: any) {
      return {
        status: "unhealthy",
        error: error.message || "Email service error",
      };
    }
  }

  /**
   * Get service stats
   */
  getServiceInfo(): {
    provider: string;
    configured: boolean;
    fromAddress: string;
  } {
    return {
      provider: "Resend",
      configured: !!config.RESEND_API_KEY,
      fromAddress: config.EMAIL_FROM,
    };
  }
}

export const emailService = new EmailService();

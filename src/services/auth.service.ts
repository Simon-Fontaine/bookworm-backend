import { config } from "../config";
import { prisma } from "../db/client";
import { Role, Session, User, Verification, VerificationType } from "../types";
import { AppError } from "../utils/app-error";
import { emailService } from "./email.service";
import { LocationInfo, geoipService } from "./geoip.service";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  fullName?: string;
  displayName?: string;
}

export interface SessionData {
  ipAddress?: string;
  userAgent?: string;
  device?: string;
  location?: string;
}

export interface LoginResult {
  user: Omit<User, "password">;
  session: {
    token: string;
    expiresAt: Date;
  };
  locationInfo?: LocationInfo | null;
}

export class AuthService {
  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<Omit<User, "password">> {
    // Normalize email and username
    const normalizedEmail = data.email.toLowerCase().trim();
    const normalizedUsername = data.username.toLowerCase().trim();

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: normalizedEmail }, { username: normalizedUsername }],
      },
    });

    if (existingUser) {
      if (existingUser.email === normalizedEmail) {
        throw new AppError("Email already in use", 400, "EMAIL_EXISTS");
      }
      throw new AppError("Username already taken", 400, "USERNAME_EXISTS");
    }

    // Hash password
    const hashedPassword = await this.hashPassword(data.password);

    // Create user
    const user = await prisma.user.create({
      data: {
        username: normalizedUsername,
        email: normalizedEmail,
        password: hashedPassword,
        fullName: data.fullName?.trim(),
        displayName: data.displayName?.trim() || data.fullName?.split(" ")[0] || normalizedUsername,
        roles: [Role.USER],
        isEmailVerified: false,
      },
    });

    // Create email verification
    await this.createEmailVerification(user.id);

    return this.sanitizeUser(user);
  }

  /**
   * Login user with email and password
   */
  async login(
    email: string,
    password: string,
    sessionInfo: Omit<SessionData, "location">,
  ): Promise<LoginResult> {
    const normalizedEmail = email.toLowerCase().trim();

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(password, user.password);
    if (!isValidPassword) {
      throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      throw new AppError("Please verify your email before signing in", 401, "EMAIL_NOT_VERIFIED");
    }

    // Get location info if IP address is available
    let locationInfo: LocationInfo | null = null;
    if (sessionInfo.ipAddress) {
      try {
        locationInfo = await geoipService.getLocationInfo(sessionInfo.ipAddress);
      } catch (error) {
        console.error("Failed to get location info:", error);
        // Continue without location info
      }
    }

    // Create session with enhanced location data
    const enhancedSessionInfo: SessionData = {
      ...sessionInfo,
      location: locationInfo?.formatted || "Unknown",
    };

    const session = await this.createSession(user.id, enhancedSessionInfo);

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { updatedAt: new Date() },
    });

    return {
      user: this.sanitizeUser(user),
      session: {
        token: session.token,
        expiresAt: session.expiresAt,
      },
      locationInfo,
    };
  }

  /**
   * Create a new session for a user
   */
  async createSession(userId: string, sessionInfo: SessionData): Promise<Session> {
    const token = this.generateSecureToken(32);
    const csrfSecret = this.generateSecureToken(16);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.SESSION_EXPIRY_DAYS);

    const session = await prisma.session.create({
      data: {
        userId,
        token,
        csrfSecret,
        expiresAt,
        ipAddress: sessionInfo.ipAddress,
        location: sessionInfo.location,
        device: sessionInfo.device,
        userAgent: sessionInfo.userAgent,
      },
    });

    return session;
  }

  /**
   * Validate a session token and return user and session data
   */
  async validateSession(
    token: string,
  ): Promise<{ user: Omit<User, "password">; session: Session } | null> {
    if (!token) {
      return null;
    }

    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!session) {
      return null;
    }

    // Check if session is expired
    if (session.expiresAt < new Date()) {
      // Delete expired session
      await prisma.session.delete({ where: { id: session.id } });
      return null;
    }

    // Check if user account is still active
    if (!session.user.isEmailVerified) {
      return null;
    }

    return {
      user: this.sanitizeUser(session.user),
      session,
    };
  }

  /**
   * Logout user by deleting session
   */
  async logout(token: string): Promise<void> {
    await prisma.session.deleteMany({
      where: { token },
    });
  }

  /**
   * Logout user from all sessions
   */
  async logoutAllSessions(userId: string, exceptSessionId?: string): Promise<void> {
    const whereClause: any = { userId };

    if (exceptSessionId) {
      whereClause.id = { not: exceptSessionId };
    }

    await prisma.session.deleteMany({
      where: whereClause,
    });
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string, currentSessionId?: string): Promise<Session[]> {
    const sessions = await prisma.session.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() }, // Only non-expired sessions
      },
      orderBy: { createdAt: "desc" },
    });

    // Mark current session
    return sessions.map((session) => ({
      ...session,
      isCurrent: session.id === currentSessionId,
    })) as Session[];
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(sessionId: string, userId: string): Promise<void> {
    await prisma.session.deleteMany({
      where: {
        id: sessionId,
        userId, // Ensure user can only revoke their own sessions
      },
    });
  }

  /**
   * Create email verification token and send email
   */
  async createEmailVerification(userId: string): Promise<Verification> {
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + config.VERIFICATION_EXPIRY_HOURS);

    // Delete existing verification tokens for this user
    await prisma.verification.deleteMany({
      where: {
        userId,
        type: VerificationType.EMAIL_VERIFICATION,
        usedAt: null, // Only delete unused tokens
      },
    });

    const verification = await prisma.verification.create({
      data: {
        userId,
        token,
        type: VerificationType.EMAIL_VERIFICATION,
        expiresAt,
      },
      include: { user: true },
    });

    // Send verification email
    try {
      await emailService.sendVerificationEmail(
        verification.user.email,
        verification.user.displayName || verification.user.username,
        token,
      );
    } catch (error) {
      console.error("Failed to send verification email:", error);
      // Don't throw here, just log the error
    }

    return verification;
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<Omit<User, "password">> {
    const verification = await prisma.verification.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!verification) {
      throw new AppError("Invalid verification token", 400, "INVALID_TOKEN");
    }

    if (verification.usedAt) {
      throw new AppError("Verification token already used", 400, "TOKEN_ALREADY_USED");
    }

    if (verification.expiresAt < new Date()) {
      throw new AppError("Verification token expired", 400, "TOKEN_EXPIRED");
    }

    if (verification.type !== VerificationType.EMAIL_VERIFICATION) {
      throw new AppError("Invalid token type", 400, "INVALID_TOKEN_TYPE");
    }

    // Update user and mark verification as used
    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id: verification.userId },
        data: {
          isEmailVerified: true,
          updatedAt: new Date(),
        },
      }),
      prisma.verification.update({
        where: { id: verification.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Send welcome email
    try {
      await emailService.sendWelcomeEmail(
        updatedUser.email,
        updatedUser.displayName || updatedUser.username,
      );
    } catch (error) {
      console.error("Failed to send welcome email:", error);
      // Don't throw here, verification was successful
    }

    return this.sanitizeUser(updatedUser);
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Don't reveal if email exists for security
      return;
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiry

    // Delete existing password reset tokens for this user
    await prisma.verification.deleteMany({
      where: {
        userId: user.id,
        type: VerificationType.PASSWORD_RESET,
        usedAt: null,
      },
    });

    await prisma.verification.create({
      data: {
        userId: user.id,
        token,
        type: VerificationType.PASSWORD_RESET,
        expiresAt,
      },
    });

    // Send password reset email
    try {
      await emailService.sendPasswordResetEmail(
        user.email,
        user.displayName || user.username,
        token,
      );
    } catch (error) {
      console.error("Failed to send password reset email:", error);
      throw new AppError("Failed to send password reset email", 500, "EMAIL_SEND_FAILED");
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<Omit<User, "password">> {
    const verification = await prisma.verification.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!verification) {
      throw new AppError("Invalid reset token", 400, "INVALID_TOKEN");
    }

    if (verification.usedAt) {
      throw new AppError("Reset token already used", 400, "TOKEN_ALREADY_USED");
    }

    if (verification.expiresAt < new Date()) {
      throw new AppError("Reset token expired", 400, "TOKEN_EXPIRED");
    }

    if (verification.type !== VerificationType.PASSWORD_RESET) {
      throw new AppError("Invalid token type", 400, "INVALID_TOKEN_TYPE");
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, config.BCRYPT_ROUNDS);

    // Update password, mark token as used, and logout all sessions
    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id: verification.userId },
        data: {
          password: hashedPassword,
          updatedAt: new Date(),
        },
      }),
      prisma.verification.update({
        where: { id: verification.id },
        data: { usedAt: new Date() },
      }),
      // Logout all sessions for security
      prisma.session.deleteMany({
        where: { userId: verification.userId },
      }),
    ]);

    return this.sanitizeUser(updatedUser);
  }

  /**
   * Change password (requires current password)
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    keepCurrentSession: boolean = true,
    currentSessionId?: string,
  ): Promise<void> {
    // Get current user with password
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }

    // Verify current password
    const isValidPassword = await this.verifyPassword(currentPassword, user.password);
    if (!isValidPassword) {
      throw new AppError("Current password is incorrect", 400, "INVALID_PASSWORD");
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, config.BCRYPT_ROUNDS);

    // Update password and optionally logout other sessions
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          password: hashedPassword,
          updatedAt: new Date(),
        },
      }),
      // Logout all other sessions except current one (if specified)
      prisma.session.deleteMany({
        where: {
          userId,
          id: keepCurrentSession && currentSessionId ? { not: currentSessionId } : undefined,
        },
      }),
    ]);
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    updates: {
      username?: string;
      displayName?: string;
      fullName?: string;
      bio?: string;
      location?: string;
    },
  ): Promise<Omit<User, "password">> {
    // If username is being updated, check if it's available
    if (updates.username) {
      const normalizedUsername = updates.username.toLowerCase().trim();
      const existingUser = await prisma.user.findFirst({
        where: {
          username: normalizedUsername,
          id: { not: userId },
        },
      });

      if (existingUser) {
        throw new AppError("Username already taken", 400, "USERNAME_EXISTS");
      }

      updates.username = normalizedUsername;
    }

    // Trim string fields
    const cleanedUpdates = Object.entries(updates).reduce((acc, [key, value]) => {
      if (typeof value === "string") {
        acc[key] = value.trim();
      } else {
        acc[key] = value;
      }
      return acc;
    }, {} as any);

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...cleanedUpdates,
        updatedAt: new Date(),
      },
    });

    return this.sanitizeUser(updatedUser);
  }

  /**
   * Delete user account
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(password, user.password);
    if (!isValidPassword) {
      throw new AppError("Invalid password", 400, "INVALID_PASSWORD");
    }

    // Delete user and all related data (cascade will handle related records)
    await prisma.user.delete({
      where: { id: userId },
    });
  }

  /**
   * Clean up expired sessions and verifications
   */
  async cleanupExpiredTokens(): Promise<{ sessionsDeleted: number; verificationsDeleted: number }> {
    const now = new Date();

    const [sessionsResult, verificationsResult] = await prisma.$transaction([
      prisma.session.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
      prisma.verification.deleteMany({
        where: {
          expiresAt: { lt: now },
          usedAt: null,
        },
      }),
    ]);

    return {
      sessionsDeleted: sessionsResult.count,
      verificationsDeleted: verificationsResult.count,
    };
  }

  /**
   * Get user by ID (sanitized)
   */
  async getUserById(userId: string): Promise<Omit<User, "password"> | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return null;
    }

    return this.sanitizeUser(user);
  }

  /**
   * Get user by username (sanitized)
   */
  async getUserByUsername(username: string): Promise<Omit<User, "password"> | null> {
    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase().trim() },
    });

    if (!user) {
      return null;
    }

    return this.sanitizeUser(user);
  }

  /**
   * Get user by email (sanitized)
   */
  async getUserByEmail(email: string): Promise<Omit<User, "password"> | null> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      return null;
    }

    return this.sanitizeUser(user);
  }

  /**
   * Get comprehensive user profile with stats
   */
  async getUserProfileByUsername(username: string): Promise<{
    user: Omit<User, "password">;
    stats: {
      followersCount: number;
      followingCount: number;
      booksCount: number;
      reviewsCount: number;
    };
  } | null> {
    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase().trim() },
      include: {
        _count: {
          select: {
            followers: true,
            following: true,
            books: true,
            reviews: true,
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    const { _count, ...userData } = user;

    return {
      user: this.sanitizeUser(userData),
      stats: {
        followersCount: _count.followers,
        followingCount: _count.following,
        booksCount: _count.books,
        reviewsCount: _count.reviews,
      },
    };
  }

  /**
   * Check if user needs onboarding
   */
  async needsOnboarding(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, displayName: true },
    });

    // User needs onboarding if they don't have a proper username or display name
    return !user || !user.username || !user.displayName;
  }

  /**
   * Bulk user lookup for social features
   */
  async getUsersByIds(userIds: string[]): Promise<Map<string, Omit<User, "password">>> {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
    });

    const userMap = new Map<string, Omit<User, "password">>();
    users.forEach((user) => {
      userMap.set(user.id, this.sanitizeUser(user));
    });

    return userMap;
  }

  /**
   * Check if user has role
   */
  async hasRole(userId: string, role: Role): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { roles: true },
    });

    return user?.roles.includes(role) || false;
  }

  /**
   * Add role to user (admin only)
   */
  async addRole(userId: string, role: Role): Promise<Omit<User, "password">> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }

    if (user.roles.includes(role)) {
      return this.sanitizeUser(user);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        roles: [...user.roles, role],
        updatedAt: new Date(),
      },
    });

    return this.sanitizeUser(updatedUser);
  }

  /**
   * Remove role from user (admin only)
   */
  async removeRole(userId: string, role: Role): Promise<Omit<User, "password">> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        roles: user.roles.filter((r) => r !== role),
        updatedAt: new Date(),
      },
    });

    return this.sanitizeUser(updatedUser);
  }

  /**
   * Remove password from user object
   */
  private sanitizeUser(user: User): Omit<User, "password"> {
    const { password, ...sanitizedUser } = user;
    return sanitizedUser;
  }

  /**
   * Generate secure random token
   */
  private generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString("hex");
  }

  /**
   * Hash password with configured rounds
   */
  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, config.BCRYPT_ROUNDS);
  }

  /**
   * Verify password against hash
   */
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}

export const authService = new AuthService();

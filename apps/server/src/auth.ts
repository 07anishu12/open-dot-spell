import { randomBytes, timingSafeEqual } from "node:crypto";

export interface AuthManagerOptions {
  pairingSecret?: string;
  pairingTtlMs?: number;
  maxPairingAttempts?: number;
  sessionTtlMs?: number;
}

export interface SessionInfo {
  token: string;
  createdAt: number;
  expiresAt: number;
}

export class AuthManager {
  private pairingSecret: string;
  private pairingSecretExpiresAt: number;
  private pairingAttemptsRemaining: number;
  private paired: boolean = false;
  private readonly sessionTtlMs: number;
  private readonly sessions = new Map<string, SessionInfo>();

  constructor(options: AuthManagerOptions = {}) {
    this.sessionTtlMs = options.sessionTtlMs ?? 24 * 60 * 60 * 1000; // 24 hours
    this.pairingAttemptsRemaining = options.maxPairingAttempts ?? 5;
    const ttl = options.pairingTtlMs ?? 15 * 60 * 1000; // 15 minutes
    this.pairingSecretExpiresAt = Date.now() + ttl;
    this.pairingSecret = options.pairingSecret ?? randomBytes(32).toString("hex");
  }

  /**
   * Internal/bootstrap helper to expose the pairing secret to local terminal stdout only.
   * This is never exposed via an HTTP endpoint.
   */
  public getPairingSecretForBootstrap(): string {
    return this.pairingSecret;
  }

  public isAlreadyPaired(): boolean {
    return this.paired;
  }

  public getAttemptsRemaining(): number {
    return this.pairingAttemptsRemaining;
  }

  /**
   * Attempts to pair using a pairing secret.
   * Enforces expiry, attempt limits, timing-safe equality, and one-time consumption.
   */
  public pair(providedSecret: string): {
    success: boolean;
    token?: string;
    expiresIn?: number;
    error?: string;
  } {
    if (this.pairingAttemptsRemaining <= 0) {
      return {
        success: false,
        error: "Pairing locked: maximum attempts exceeded."
      };
    }

    if (!this.pairingSecret || Date.now() > this.pairingSecretExpiresAt) {
      return {
        success: false,
        error: "Pairing secret has expired or is invalid."
      };
    }

    // Timing-safe comparison to prevent timing side-channel attacks
    const expectedBuf = Buffer.from(this.pairingSecret, "utf8");
    const providedBuf = Buffer.from(providedSecret, "utf8");

    let isMatch = false;
    if (expectedBuf.length === providedBuf.length) {
      isMatch = timingSafeEqual(expectedBuf, providedBuf);
    }

    if (!isMatch) {
      this.pairingAttemptsRemaining--;
      return {
        success: false,
        error: `Invalid pairing secret. ${this.pairingAttemptsRemaining} attempts remaining.`
      };
    }

    // Successful pairing: mark paired and immediately invalidate the one-time pairing secret
    this.paired = true;
    this.pairingSecret = "";

    // Generate cryptographically secure session token (32 bytes entropy)
    const token = randomBytes(32).toString("hex");
    const now = Date.now();
    const expiresAt = now + this.sessionTtlMs;

    this.sessions.set(token, {
      token,
      createdAt: now,
      expiresAt
    });

    return {
      success: true,
      token,
      expiresIn: Math.floor(this.sessionTtlMs / 1000)
    };
  }

  /**
   * Validates an active session token.
   */
  public validateSession(token: string | undefined): boolean {
    if (!token) {
      return false;
    }
    const session = this.sessions.get(token);
    if (!session) {
      return false;
    }
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      return false;
    }
    return true;
  }

  /**
   * Invalidates a session token (logout).
   */
  public revokeSession(token: string | undefined): void {
    if (token) {
      this.sessions.delete(token);
    }
  }

  /**
   * Resets pairing for re-pairing or testing scenarios.
   */
  public resetPairing(newSecret?: string, ttlMs: number = 15 * 60 * 1000): void {
    this.pairingSecret = newSecret ?? randomBytes(32).toString("hex");
    this.pairingSecretExpiresAt = Date.now() + ttlMs;
    this.pairingAttemptsRemaining = 5;
    this.paired = false;
  }
}

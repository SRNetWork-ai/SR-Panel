import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { generateSessionToken } from './store.types';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionContext {
  userAgent?: string;
  ipAddress?: string | null;
}

@Injectable()
export class StoreCustomerAuthService {
  constructor(private prisma: PrismaService) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Create a session for a customer. Returns the plaintext session token once. */
  async createSession(
    customerId: string,
    context?: SessionContext,
    authChannel: string = 'telegram',
  ): Promise<{ sessionToken: string; expiresAt: Date }> {
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.prisma.storeCustomerSession.create({
      data: {
        customerId,
        tokenHash: this.hash(sessionToken),
        authChannel,
        userAgent: context?.userAgent || null,
        ipAddress: context?.ipAddress || null,
        expiresAt,
      },
    });
    await this.prisma.storeCustomer
      .update({
        where: { id: customerId },
        data: {
          lastLoginAt: new Date(),
          lastSeenAt: new Date(),
          loginCount: { increment: 1 },
        },
      })
      .catch(() => undefined);
    return { sessionToken, expiresAt };
  }

  /** Validate a session token and return the owning customer. */
  async validateSession(sessionToken: string) {
    if (!sessionToken) throw new UnauthorizedException('Session token required');
    const session = await this.prisma.storeCustomerSession.findUnique({
      where: { tokenHash: this.hash(sessionToken) },
      include: { customer: true },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Session expired - please log in again');
    }
    if (session.customer.status !== 'active') {
      throw new UnauthorizedException('This account has been disabled');
    }
    await this.prisma.storeCustomerSession
      .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    await this.prisma.storeCustomer
      .update({ where: { id: session.customerId }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
    return session.customer;
  }

  /** Login with the permanent HM-XXXX-XXXX-XXXX customer token. */
  async loginWithPermanentToken(token: string, context?: SessionContext) {
    const normalized = String(token || '').trim().toUpperCase();
    if (!normalized) throw new UnauthorizedException('Token required');
    const customer = await this.prisma.storeCustomer.findUnique({
      where: { token: normalized },
    });
    if (!customer || customer.status !== 'active') {
      throw new UnauthorizedException('Invalid customer token');
    }
    const session = await this.createSession(customer.id, context, 'token');
    return {
      sessionToken: session.sessionToken,
      expiresAt: session.expiresAt,
      customer: {
        id: customer.id,
        token: customer.token,
        name: customer.name,
        telegram: customer.telegram,
        whatsapp: customer.whatsapp,
        email: customer.email,
      },
    };
  }

  /** Revoke a session (logout). Safe to call with unknown tokens. */
  async revokeSession(sessionToken: string) {
    if (!sessionToken) return { ok: true };
    await this.prisma.storeCustomerSession.updateMany({
      where: { tokenHash: this.hash(sessionToken) },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }
}

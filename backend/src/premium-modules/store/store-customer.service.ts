import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { generateCustomerToken } from './store.types';

export interface CustomerContactInput {
  token?: string;
  name?: string;
  telegram?: string;
  whatsapp?: string;
  email?: string;
}

/**
 * Store customer registry: permanent-token based accounts that link web
 * store / Telegram mini-app buyers to their orders and VPN services.
 */
@Injectable()
export class StoreCustomerService {
  constructor(private prisma: PrismaService) {}

  private normalizeToken(token: string): string {
    return String(token || '').trim().toUpperCase();
  }

  /** Load a customer with everything the portal dashboard needs. */
  async getByToken(token: string) {
    const normalized = this.normalizeToken(token);
    if (!normalized) return null;
    return this.prisma.storeCustomer.findUnique({
      where: { token: normalized },
      include: {
        orders: {
          include: {
            product: { include: { category: true } },
            payment: true,
            timeline: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        notifications: { orderBy: { createdAt: 'desc' }, take: 100 },
        activities: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
  }

  /** Find a customer by store slug + permanent token (scoped to that store's admin). */
  async lookupByStore(slug: string, token: string) {
    const normalized = this.normalizeToken(token);
    if (!normalized) return null;
    const store = await this.prisma.storeProfile.findUnique({ where: { slug } });
    if (!store) return null;
    return this.prisma.storeCustomer.findFirst({
      where: { adminId: store.adminId, token: normalized },
    });
  }

  /**
   * Find an existing customer by permanent token, or create a fresh account.
   * Returns null when a token was supplied but does not match this store -
   * callers treat that as an invalid token.
   */
  async findOrCreate(adminId: string, input: CustomerContactInput) {
    if (input.token) {
      const existing = await this.prisma.storeCustomer.findFirst({
        where: { adminId, token: this.normalizeToken(input.token) },
      });
      if (!existing) return null;
      const data: Prisma.StoreCustomerUpdateInput = { lastSeenAt: new Date() };
      if (input.name && input.name !== existing.name) data.name = input.name;
      if (input.telegram && input.telegram !== existing.telegram) data.telegram = input.telegram;
      if (input.whatsapp && input.whatsapp !== existing.whatsapp) data.whatsapp = input.whatsapp;
      if (input.email && input.email !== existing.email) data.email = input.email;
      return this.prisma.storeCustomer.update({ where: { id: existing.id }, data });
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.storeCustomer.create({
          data: {
            adminId,
            token: generateCustomerToken(),
            name: input.name?.trim() || null,
            telegram: input.telegram?.trim() || null,
            whatsapp: input.whatsapp?.trim() || null,
            email: input.email?.trim() || null,
            lastSeenAt: new Date(),
          },
        });
      } catch (err) {
        // Token collision - extremely unlikely, retry with a fresh token.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue;
        throw err;
      }
    }
    throw new Error('Could not generate a unique customer token');
  }

  /** Admin view: all customers of this store with order stats. */
  async listForAdmin(adminId: string) {
    const customers = await this.prisma.storeCustomer.findMany({
      where: { adminId },
      include: {
        _count: { select: { orders: true } },
        orders: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return customers.map(({ _count, orders, ...customer }) => ({
      ...customer,
      ordersCount: _count.orders,
      lastOrderAt: orders[0]?.createdAt ?? null,
      lastOrderStatus: orders[0]?.status ?? null,
    }));
  }

  /** Admin view: full customer profile with orders and linked services. */
  async getDetail(adminId: string, customerId: string) {
    const customer = await this.prisma.storeCustomer.findFirst({
      where: { id: customerId, adminId },
      include: {
        orders: {
          include: { product: { include: { category: true } }, payment: true, timeline: true },
          orderBy: { createdAt: 'desc' },
        },
        notifications: { orderBy: { createdAt: 'desc' }, take: 50 },
        activities: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!customer) return null;

    const clientIds = new Set<string>();
    for (const order of customer.orders) {
      if (order.clientId) clientIds.add(order.clientId);
      if (order.renewClientId) clientIds.add(order.renewClientId);
    }
    const meta = (customer.metadata ?? {}) as { linkedClientIds?: unknown };
    if (Array.isArray(meta.linkedClientIds)) {
      for (const id of meta.linkedClientIds) {
        if (typeof id === 'string' && id.trim()) clientIds.add(id);
      }
    }

    const services = clientIds.size
      ? await this.prisma.client.findMany({
          where: { id: { in: [...clientIds] } },
          select: {
            id: true,
            email: true,
            remark: true,
            subId: true,
            subToken: true,
            enable: true,
            expiryTime: true,
            total: true,
            up: true,
            down: true,
          },
        })
      : [];

    return {
      ...customer,
      services,
      ordersCount: customer.orders.length,
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface CustomerNotificationInput {
  type: string;
  title: string;
  message?: string | null;
  payload?: Record<string, unknown>;
  orderId?: string;
}

@Injectable()
export class StoreCustomerNotificationsService {
  private readonly logger = new Logger(StoreCustomerNotificationsService.name);

  constructor(private prisma: PrismaService) {}

  /** Persist an in-app notification for the customer portal / mini app. */
  async notifyCustomer(customerId: string, input: CustomerNotificationInput) {
    try {
      return await this.prisma.storeCustomerNotification.create({
        data: {
          customerId,
          type: input.type,
          title: input.title,
          message: input.message ?? null,
          payload: (input.payload ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to store customer notification: ${message}`);
      return null;
    }
  }

  async markAsRead(customerId: string, notificationId: string) {
    await this.prisma.storeCustomerNotification.updateMany({
      where: { id: notificationId, customerId },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async markAllAsRead(customerId: string) {
    await this.prisma.storeCustomerNotification.updateMany({
      where: { customerId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}

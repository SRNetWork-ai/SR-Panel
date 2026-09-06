import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SettingsModule } from '../../settings/settings.module';
import { ClientsModule } from '../../clients/clients.module';
import { PanelsModule } from '../../panels/panels.module';
import { BrandingModule } from '../branding/branding.module';
import { StoreService } from './store.service';
import { StoreTelegramService } from './store-telegram.service';
import { StoreCustomerService } from './store-customer.service';
import { StoreCustomerAuthService } from './store-customer-auth.service';
import { StoreCustomerNotificationsService } from './store-customer-notifications.service';
import { StoreProvisioningService } from './store-provisioning.service';
import { StoreRateLimitService } from './store-rate-limit.service';
import { StoreAdminController } from './store-admin.controller';
import { StorePublicController } from './store-public.controller';

/**
 * Full web store + Telegram mini-app backend, wired into the community
 * build as a first-class module (no premium bundle required).
 */
@Module({
  imports: [PrismaModule, SettingsModule, ClientsModule, PanelsModule, BrandingModule],
  controllers: [StoreAdminController, StorePublicController],
  providers: [
    StoreService,
    StoreTelegramService,
    StoreCustomerService,
    StoreCustomerAuthService,
    StoreCustomerNotificationsService,
    StoreProvisioningService,
    StoreRateLimitService,
  ],
  exports: [StoreService, StoreTelegramService],
})
export class StoreModule {}

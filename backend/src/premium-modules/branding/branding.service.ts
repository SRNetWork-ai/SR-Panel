import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface BrandingInfo {
  name: string;
  logo: string | null;
  logoDark: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  footerText: string | null;
  supportLinks: unknown;
  theme: string | null;
  supportEmail?: string | null;
  description?: string | null;
}

export interface BrandingUpdateInput {
  name?: string;
  description?: string | null;
  logo?: string | null;
  logoDark?: string | null;
  theme?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  footerText?: string | null;
  supportEmail?: string | null;
  supportLinks?: unknown;
}

/**
 * Community implementation of the branding backend. Reads the per-admin
 * Brand row and falls back to the store profile / admin username so the
 * storefront and subscription portal always get a usable brand object.
 */
@Injectable()
export class BrandingService {
  constructor(private prisma: PrismaService) {}

  async getBranding(adminId: string): Promise<BrandingInfo> {
    const [brand, store, admin] = await Promise.all([
      this.prisma.brand.findUnique({ where: { adminId } }).catch(() => null),
      this.prisma.storeProfile.findUnique({ where: { adminId } }).catch(() => null),
      this.prisma.admin.findUnique({ where: { id: adminId } }).catch(() => null),
    ]);

    return {
      name: brand?.name || store?.title || admin?.username || 'My Panel',
      logo: brand?.logo ?? store?.logo ?? null,
      logoDark: brand?.logoDark ?? null,
      primaryColor: brand?.primaryColor ?? null,
      accentColor: brand?.accentColor ?? null,
      footerText: brand?.footerText ?? null,
      supportLinks: brand?.supportLinks ?? null,
      theme: brand?.theme ?? null,
      supportEmail: brand?.supportEmail ?? null,
      description: brand?.description ?? null,
    };
  }

  async upsertBranding(adminId: string, data: BrandingUpdateInput): Promise<BrandingInfo> {
    const update: Prisma.BrandUpdateInput = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.description !== undefined) update.description = data.description;
    if (data.logo !== undefined) update.logo = data.logo;
    if (data.logoDark !== undefined) update.logoDark = data.logoDark;
    if (data.theme !== undefined) update.theme = data.theme;
    if (data.primaryColor !== undefined) update.primaryColor = data.primaryColor;
    if (data.accentColor !== undefined) update.accentColor = data.accentColor;
    if (data.footerText !== undefined) update.footerText = data.footerText;
    if (data.supportEmail !== undefined) update.supportEmail = data.supportEmail;
    if (data.supportLinks !== undefined) {
      update.supportLinks = (data.supportLinks ?? Prisma.JsonNull) as Prisma.InputJsonValue;
    }

    await this.prisma.brand.upsert({
      where: { adminId },
      update,
      create: {
        admin: { connect: { id: adminId } },
        name: data.name || 'My Brand',
        description: data.description ?? null,
        logo: data.logo ?? null,
        logoDark: data.logoDark ?? null,
        theme: data.theme ?? null,
        primaryColor: data.primaryColor ?? null,
        accentColor: data.accentColor ?? null,
        footerText: data.footerText ?? null,
        supportEmail: data.supportEmail ?? null,
        supportLinks: (data.supportLinks ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });

    return this.getBranding(adminId);
  }
}

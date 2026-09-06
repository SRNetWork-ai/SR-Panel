import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';

export const PREMIUM_MODULE_KEY = 'premiumModuleId';

/** Marks a controller (or handler) as belonging to a premium module. */
export const RequirePremiumModule = (moduleId: string) =>
  SetMetadata(PREMIUM_MODULE_KEY, moduleId);

/**
 * Per-admin premium module access control.
 *
 * - The module must not be globally disabled (PremiumModuleState.enabled).
 * - SUPER_ADMIN always has access to every module.
 * - Regular admins need an enabled AdminModuleAssignment row, which the
 *   super admin manages from the premium assignments screen.
 *
 * If the metadata tables do not exist yet (fresh install before migration),
 * access is allowed so the panel never bricks itself.
 */
@Injectable()
export class PremiumModuleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const moduleId = this.reflector.getAllAndOverride<string | undefined>(
      PREMIUM_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!moduleId) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: { id?: string; role?: string } }>();
    const user = request.user;
    if (!user?.id) return true; // auth guard handles unauthenticated requests

    let globallyDisabled = false;
    try {
      const state = await this.prisma.premiumModuleState.findUnique({
        where: { moduleId },
      });
      globallyDisabled = state ? !state.enabled : false;
    } catch {
      globallyDisabled = false; // table missing - treat as enabled
    }
    if (globallyDisabled) {
      throw new ForbiddenException(`Module "${moduleId}" is disabled on this panel.`);
    }

    if (user.role === 'SUPER_ADMIN') return true;

    try {
      const assignment = await this.prisma.adminModuleAssignment.findFirst({
        where: { adminId: user.id, moduleId, enabled: true },
      });
      if (!assignment) {
        throw new ForbiddenException(
          `You do not have access to the "${moduleId}" module. Ask the panel owner to enable it for your account.`,
        );
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      // assignment table missing - allow rather than brick the panel
    }

    return true;
  }
}

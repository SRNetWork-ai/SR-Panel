import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

/**
 * Unlocked build: every install is treated as fully licensed, so premium
 * routes are always reachable. Auth and role guards still apply as usual.
 */
@Injectable()
export class PremiumGuard implements CanActivate {
  async canActivate(_context: ExecutionContext): Promise<boolean> {
    return true;
  }
}

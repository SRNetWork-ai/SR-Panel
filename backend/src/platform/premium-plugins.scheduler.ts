import { Injectable, Logger } from '@nestjs/common';

/**
 * Premium bundle watchdog disabled: all modules ship compiled into the
 * main application, so there is nothing to reload or restart.
 */
@Injectable()
export class PremiumPluginsScheduler {
  private readonly logger = new Logger(PremiumPluginsScheduler.name);

  async ensurePremiumPluginsLoaded(): Promise<void> {
    // no-op: premium modules are compiled in
  }
}

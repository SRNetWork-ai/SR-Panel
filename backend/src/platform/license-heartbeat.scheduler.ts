import { Injectable, Logger } from '@nestjs/common';

/**
 * License heartbeat removed: this build never contacts a license server.
 * The class is kept so existing module wiring stays valid.
 */
@Injectable()
export class LicenseHeartbeatScheduler {
  private readonly logger = new Logger(LicenseHeartbeatScheduler.name);

  async dailyHeartbeat(): Promise<void> {
    // no-op: no license server in this build
  }

  async runHeartbeatWithRetry(): Promise<void> {
    // no-op: no license server in this build
  }
}

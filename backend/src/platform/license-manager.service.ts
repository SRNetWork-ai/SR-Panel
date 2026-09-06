import { Injectable, Logger } from '@nestjs/common';
import type { LicenseState } from './types/module-manifest.types';
import { getAllFeatureIds } from './manifests';

/**
 * Unlocked build: the panel is always fully licensed, locally and forever.
 * There is no license server, no heartbeat, no expiry and no grace window.
 * The public API of this service is kept identical to the original so the
 * rest of the codebase (guards, catalog, schedulers, controllers) works
 * without modification.
 */
@Injectable()
export class LicenseManagerService {
  private readonly logger = new Logger(LicenseManagerService.name);

  private fullState(): LicenseState {
    return {
      status: 'active',
      mode: 'full',
      expiresAt: null,
      graceEndsAt: null,
      licensedFeatures: getAllFeatureIds(),
      edition: 'PREMIUM',
      lastHeartbeatAt: null,
      lastServerCheckAt: new Date().toISOString(),
      bundleVersion: 'integrated',
      activationId: 'local-unlocked',
      instanceId: 'local',
    };
  }

  async getLicenseState(): Promise<LicenseState> {
    return this.fullState();
  }

  async isFeatureLicensed(_featureId: string): Promise<boolean> {
    return true;
  }

  async setLicenseState(
    _state: Omit<LicenseState, 'edition'> & { edition?: 'COMMUNITY' | 'PREMIUM' },
  ): Promise<void> {
    // License state is fixed in this build and never persisted.
  }

  async refreshFromServer(): Promise<LicenseState> {
    return this.fullState();
  }

  async markServerUnreachable(): Promise<void> {
    // No license server in this build.
  }
}

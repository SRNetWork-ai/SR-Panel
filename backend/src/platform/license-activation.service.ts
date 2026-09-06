import { Injectable, Logger } from '@nestjs/common';
import { LicenseManagerService } from './license-manager.service';
import type { LicenseState } from './types/module-manifest.types';
import { getPanelVersion } from '../common/utils/panel-version.util';

export interface ActivationProgress {
  stage: string;
  percent: number;
  message?: string;
}

export interface ActivateResult {
  ok: boolean;
  state: LicenseState;
  bundleVersion?: string;
  needsReload?: boolean;
  needsRestart?: boolean;
  autoRestart?: boolean;
  bundleSkipped?: boolean;
  licenseServerUrl?: string;
  message?: string;
}

/**
 * Local activation service: this build has no license server and no premium
 * bundle download pipeline. Every method resolves locally and reports the
 * panel as fully activated. The API surface matches the original service so
 * the platform controller keeps working unchanged.
 */
@Injectable()
export class LicenseActivationService {
  private readonly logger = new Logger(LicenseActivationService.name);

  constructor(private licenseManager: LicenseManagerService) {}

  getLicenseServerUrl(): string {
    return 'local';
  }

  getLicenseServerUrls(): string[] {
    return [];
  }

  async getClientIp(): Promise<string> {
    return '127.0.0.1';
  }

  async activate(_licenseKey: string): Promise<ActivateResult> {
    const state = await this.licenseManager.getLicenseState();
    return {
      ok: true,
      state,
      bundleVersion: 'integrated',
      needsReload: false,
      needsRestart: false,
      autoRestart: false,
      bundleSkipped: true,
      licenseServerUrl: 'local',
      message: 'This build is permanently unlocked - no activation needed.',
    };
  }

  async updateBundle(): Promise<ActivateResult> {
    const state = await this.licenseManager.getLicenseState();
    return {
      ok: true,
      state,
      bundleVersion: 'integrated',
      needsReload: false,
      needsRestart: false,
      autoRestart: false,
      bundleSkipped: true,
      licenseServerUrl: 'local',
      message: 'All premium modules are compiled into this build - nothing to download.',
    };
  }

  async deactivate(): Promise<{ needsReload: boolean }> {
    // Nothing to deactivate: the build stays unlocked.
    return { needsReload: false };
  }

  async getBundleStatus() {
    return {
      installed: true,
      version: 'integrated',
      source: 'built-in',
      panelVersion: getPanelVersion(),
      message: 'Premium modules are compiled into the main application.',
    };
  }

  async reloadPlugins(): Promise<{
    ok: boolean;
    reloaded: boolean;
    message: string;
  }> {
    return {
      ok: true,
      reloaded: false,
      message: 'Premium modules are compiled in - no dynamic plugins to reload.',
    };
  }

  async diagnoseBundle(): Promise<Record<string, unknown>> {
    const state = await this.licenseManager.getLicenseState();
    return {
      ok: true,
      mode: 'integrated',
      bundleInstalled: true,
      licenseServerReachable: true,
      state,
      notes: [
        'This build ships all premium modules compiled into the backend.',
        'No license server, bundle download, or activation is required.',
      ],
    };
  }

  async recheckNow(): Promise<LicenseState> {
    return this.licenseManager.getLicenseState();
  }
}

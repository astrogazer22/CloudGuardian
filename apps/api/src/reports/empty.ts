import type { BackupReport, CloudWatchReport, InspectorReport, ReportError, TrendMicroReport } from './types';

export function emptyCloudWatch(errors: ReportError[] = []): CloudWatchReport {
  return { source: 'live', errors, totals: { OK: 0, ALARM: 0, INSUFFICIENT_DATA: 0, total: 0 }, byNamespace: [], byAccount: [], alarms: [] };
}

export function emptyBackup(errors: ReportError[] = []): BackupReport {
  return {
    source: 'live',
    errors,
    summary: { vaults: 0, protectedResources: 0, recoveryPoints: 0, jobs24h: 0, succeeded: 0, failed: 0, running: 0, bytes24h: 0 },
    vaults: [],
    jobs: [],
    protectedResources: [],
  };
}

export function emptyTrendMicro(errors: ReportError[] = []): TrendMicroReport {
  return {
    source: 'live',
    errors,
    summary: { computers: 0, online: 0, offline: 0, error: 0, protected: 0, atRisk: 0, openThreats: 0 },
    modules: {
      antiMalware: { on: 0, off: 0 },
      intrusionPrevention: { on: 0, off: 0 },
      integrityMonitoring: { on: 0, off: 0 },
      firewall: { on: 0, off: 0 },
      webReputation: { on: 0, off: 0 },
      logInspection: { on: 0, off: 0 },
    },
    computers: [],
    threats: [],
  };
}

export function emptyInspector(errors: ReportError[] = []): InspectorReport {
  return {
    source: 'live',
    errors,
    summary: { findings: 0, critical: 0, high: 0, medium: 0, low: 0, informational: 0, resourcesScanned: 0 },
    byType: [],
    findings: [],
  };
}

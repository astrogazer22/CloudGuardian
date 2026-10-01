export type ReportSource = 'live';

export interface ReportError {
  accountId: string;
  accountName: string;
  service: string;
  message: string;
}

export interface ReportAccount {
  id: string;
  name: string;
  accountId: string;
  mock: boolean;
  regions: string[];
}

export interface Slice {
  key: string;
  label: string;
  count: number;
}

export interface CloudWatchAlarm {
  name: string;
  state: 'OK' | 'ALARM' | 'INSUFFICIENT_DATA';
  namespace: string;
  metric: string;
  statistic?: string;
  threshold?: string;
  accountId: string;
  accountName: string;
  region: string;
  reason?: string;
  updatedAt: string;
  actionsEnabled: boolean;
}

export interface CloudWatchReport {
  source: ReportSource;
  errors: ReportError[];
  totals: { OK: number; ALARM: number; INSUFFICIENT_DATA: number; total: number };
  byNamespace: Slice[];
  byAccount: { accountId: string; accountName: string; OK: number; ALARM: number; INSUFFICIENT_DATA: number }[];
  alarms: CloudWatchAlarm[];
}

export interface BackupJob {
  id: string;
  resourceArn: string;
  resourceName: string;
  resourceType: string;
  status: string;
  startedAt: string;
  completedAt?: string | null;
  bytes?: number | null;
  accountId: string;
  accountName: string;
  region: string;
}

export interface BackupVault {
  name: string;
  accountId: string;
  accountName: string;
  region: string;
  recoveryPoints: number;
  encrypted: boolean;
  lastBackupAt?: string | null;
}

export interface BackupReport {
  source: ReportSource;
  errors: ReportError[];
  summary: {
    vaults: number;
    protectedResources: number;
    recoveryPoints: number;
    jobs24h: number;
    succeeded: number;
    failed: number;
    running: number;
    bytes24h: number;
  };
  vaults: BackupVault[];
  jobs: BackupJob[];
  protectedResources: { arn: string; name: string; type: string; lastBackupAt?: string | null; accountId: string; accountName: string; region: string }[];
}

export interface TrendComputer {
  id: string;
  name: string;
  hostname: string;
  os: string;
  status: 'online' | 'offline' | 'error';
  agentVersion: string;
  lastSeenAt: string;
  group: string;
  accountId: string;
  accountName: string;
  modules: {
    antiMalware: boolean;
    intrusionPrevention: boolean;
    integrityMonitoring: boolean;
    firewall: boolean;
    webReputation: boolean;
    logInspection: boolean;
  };
  threats: number;
}

export interface TrendThreat {
  id: string;
  computer: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  detectedAt: string;
  status: 'open' | 'quarantined' | 'cleaned' | 'allowed';
  file?: string;
}

export interface TrendMicroReport {
  source: ReportSource;
  errors: ReportError[];
  summary: {
    computers: number;
    online: number;
    offline: number;
    error: number;
    protected: number;
    atRisk: number;
    openThreats: number;
  };
  modules: Record<
    'antiMalware' | 'intrusionPrevention' | 'integrityMonitoring' | 'firewall' | 'webReputation' | 'logInspection',
    { on: number; off: number }
  >;
  computers: TrendComputer[];
  threats: TrendThreat[];
}

export interface InspectorFinding {
  id: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL' | 'UNTRIAGED';
  status: 'ACTIVE' | 'SUPPRESSED' | 'CLOSED';
  type: string;
  resource: string;
  resourceType: string;
  cve?: string | null;
  score?: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
  accountId: string;
  accountName: string;
  region: string;
  description?: string;
}

export interface InspectorReport {
  source: ReportSource;
  errors: ReportError[];
  summary: {
    findings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    informational: number;
    resourcesScanned: number;
  };
  byType: Slice[];
  findings: InspectorFinding[];
}

export interface ReportsPayload {
  generatedAt: string;
  source: 'live' | 'disconnected';
  errors: ReportError[];
  accounts: ReportAccount[];
  cloudwatch: CloudWatchReport;
  backup: BackupReport;
  trendmicro: TrendMicroReport;
  inspector: InspectorReport;
}

export type Role = 'ADMIN' | 'AGENT' | 'APPROVER' | 'VIEWER' | 'REQUESTER';
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';
export type TicketType = 'INCIDENT' | 'SERVICE_REQUEST' | 'CHANGE' | 'PROBLEM' | 'TASK';
export type StatusCategory = 'TODO' | 'IN_PROGRESS' | 'DONE';
export type AssetType = 'EC2_INSTANCE' | 'LOAD_BALANCER' | 'TARGET_GROUP' | 'IAM_USER';

export const ROLES: Role[] = ['ADMIN', 'AGENT', 'APPROVER', 'VIEWER', 'REQUESTER'];
export const PRIORITIES: Priority[] = ['P1', 'P2', 'P3', 'P4'];
export const TICKET_TYPES: TicketType[] = ['INCIDENT', 'SERVICE_REQUEST', 'CHANGE', 'PROBLEM', 'TASK'];
export const TIERS = ['STANDARD', 'PREMIUM', 'ENTERPRISE'] as const;

export interface UserBrief {
  id: string;
  name: string;
  email: string;
  role?: Role;
}

export interface Me extends UserBrief {
  role: Role;
  roleKey: string;
  roleName: string;
  title?: string;
  teams: { id: string; name: string }[];
  permissions: string[];
  ticketScope: 'ALL' | 'TEAM' | 'OWN';
  inventoryEnvironments: string[];
}

export interface WorkflowStatus {
  key: string;
  name: string;
  category: StatusCategory;
  pausesSla?: boolean;
}

export interface WorkflowTransition {
  key: string;
  name: string;
  from: string[];
  to: string;
  requiredFields?: string[];
  allowedRoles?: string[];
  requireComment?: boolean;
  requiresApproval?: { approverRole: string };
}

export interface TicketListItem {
  id: string;
  number: number;
  title: string;
  type: TicketType;
  priority: Priority;
  status: string;
  statusName: string;
  statusCategory: StatusCategory;
  category?: string | null;
  tags: string[];
  requester: UserBrief;
  assignee?: UserBrief | null;
  team?: { id: string; name: string } | null;
  organization?: { id: string; name: string; tier: string } | null;
  responseDueAt?: string | null;
  resolutionDueAt?: string | null;
  firstRespondedAt?: string | null;
  resolvedAt?: string | null;
  slaBreached: boolean;
  slaPausedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type ReportSource = 'live' | 'disconnected';

export interface ReportError {
  accountId: string;
  accountName: string;
  service: string;
  message: string;
}

export interface ReportsPayload {
  generatedAt: string;
  source: ReportSource;
  errors: ReportError[];
  accounts: { id: string; name: string; accountId: string; mock: boolean; regions: string[] }[];
  cloudwatch: {
    source: 'live';
    errors: ReportError[];
    totals: { OK: number; ALARM: number; INSUFFICIENT_DATA: number; total: number };
    byNamespace: { key: string; label: string; count: number }[];
    byAccount: { accountId: string; accountName: string; OK: number; ALARM: number; INSUFFICIENT_DATA: number }[];
    alarms: {
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
    }[];
  };
  backup: {
    source: 'live';
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
    vaults: {
      name: string;
      accountId: string;
      accountName: string;
      region: string;
      recoveryPoints: number;
      encrypted: boolean;
      lastBackupAt?: string | null;
    }[];
    jobs: {
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
    }[];
    protectedResources: {
      arn: string;
      name: string;
      type: string;
      lastBackupAt?: string | null;
      accountId: string;
      accountName: string;
      region: string;
    }[];
  };
  trendmicro: {
    source: 'live';
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
    modules: Record<string, { on: number; off: number }>;
    computers: {
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
      modules: Record<string, boolean>;
      threats: number;
    }[];
    threats: {
      id: string;
      computer: string;
      type: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      detectedAt: string;
      status: 'open' | 'quarantined' | 'cleaned' | 'allowed';
      file?: string;
    }[];
  };
  inspector: {
    source: 'live';
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
    byType: { key: string; label: string; count: number }[];
    findings: {
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
    }[];
  };
}

export type StatusCategory = 'TODO' | 'IN_PROGRESS' | 'DONE';

export interface WorkflowStatus {
  key: string;
  name: string;
  category: StatusCategory;
  /** SLA clocks are considered paused while a ticket sits in this status (e.g. waiting on customer). */
  pausesSla?: boolean;
}

export interface WorkflowTransition {
  key: string;
  name: string;
  /** Source status keys; "*" means any status. */
  from: string[];
  to: string;
  /** Ticket fields that must be non-empty, e.g. "assigneeId", "category", "customFields.rootCause". */
  requiredFields?: string[];
  /** If set, only these roles (plus ADMIN) may trigger the transition. Accepts role keys (e.g. "CAB") or base roles. */
  allowedRoles?: string[];
  requireComment?: boolean;
  /** Transition is held until a user with approverRole (role key or base role) approves it. */
  requiresApproval?: { approverRole: string };
}

export interface WorkflowDefinition {
  initialStatus: string;
  statuses: WorkflowStatus[];
  transitions: WorkflowTransition[];
}

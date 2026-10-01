import { Role, TicketScope } from '@prisma/client';

export const PERMISSION_GROUPS = [
  {
    group: 'Tickets',
    items: [
      ['tickets:read', 'View tickets (limited by the role’s ticket scope)'],
      ['tickets:create', 'Create tickets and submit catalog requests'],
      ['tickets:comment', 'Reply on tickets'],
      ['tickets:transition', 'Move tickets through their workflow'],
      ['tickets:edit', 'Edit priority, category, tags, custom fields and linked assets'],
      ['tickets:assign', 'Assign tickets to people and teams'],
      ['tickets:view_internal', 'See and write internal notes'],
    ],
  },
  { group: 'Approvals', items: [['approvals:decide', 'Approve or reject workflow approvals addressed to the role']] },
  {
    group: 'Inventory',
    items: [
      ['inventory:read', 'View AWS inventory (limited by the role’s environments)'],
      ['inventory:manage', 'Connect AWS accounts and trigger syncs'],
    ],
  },
  {
    group: 'Reports',
    items: [['reports:read', 'View CloudWatch, Backup, Trend Micro and Inspector reports']],
  },
  {
    group: 'Customers',
    items: [
      ['crm:read', 'View organizations and contacts'],
      ['crm:write', 'Create and edit organizations and contacts'],
    ],
  },
  {
    group: 'Knowledge & catalog',
    items: [
      ['kb:read', 'Read published knowledge articles'],
      ['kb:write', 'Draft and edit articles, submit for review'],
      ['kb:publish', 'Publish or archive articles and manage categories'],
      ['catalog:manage', 'Manage the service catalog'],
    ],
  },
  {
    group: 'Administration',
    items: [
      ['users:manage', 'Manage users and teams'],
      ['roles:manage', 'Manage roles and permissions'],
      ['settings:manage', 'Workflows, SLAs, business calendars, escalations and automation'],
      ['integrations:manage', 'Slack and Microsoft Teams integrations'],
      ['audit:read', 'View the audit log'],
    ],
  },
] as const;

export type Permission = (typeof PERMISSION_GROUPS)[number]['items'][number][0];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.items.map(([p]) => p)) as Permission[];

export const SYSTEM_ROLES: Record<
  Role,
  { name: string; description: string; permissions: Permission[]; ticketScope: TicketScope }
> = {
  ADMIN: {
    name: 'Administrator',
    description: 'Full access to everything. Permissions cannot be reduced.',
    permissions: ALL_PERMISSIONS,
    ticketScope: 'ALL',
  },
  AGENT: {
    name: 'Agent',
    description: 'Works tickets, manages customers and writes knowledge articles.',
    permissions: [
      'tickets:read',
      'tickets:create',
      'tickets:comment',
      'tickets:transition',
      'tickets:edit',
      'tickets:assign',
      'tickets:view_internal',
      'inventory:read',
      'reports:read',
      'crm:read',
      'crm:write',
      'kb:read',
      'kb:write',
    ],
    ticketScope: 'ALL',
  },
  APPROVER: {
    name: 'Approver',
    description: 'Approves changes and requests.',
    permissions: [
      'tickets:read',
      'tickets:comment',
      'tickets:transition',
      'tickets:view_internal',
      'approvals:decide',
      'inventory:read',
      'reports:read',
      'crm:read',
      'kb:read',
    ],
    ticketScope: 'ALL',
  },
  VIEWER: {
    name: 'Viewer',
    description: 'Read-only access.',
    permissions: ['tickets:read', 'tickets:view_internal', 'inventory:read', 'reports:read', 'crm:read', 'kb:read'],
    ticketScope: 'ALL',
  },
  REQUESTER: {
    name: 'Requester',
    description: 'Uses the self-service portal to raise and follow their own requests.',
    permissions: ['tickets:read', 'tickets:create', 'tickets:comment', 'tickets:transition', 'kb:read'],
    ticketScope: 'OWN',
  },
};

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  /** Base role — persona-level behaviour (portal, workflow fallbacks). */
  role: Role;
  roleKey: string;
  roleName: string;
  permissions: string[];
  ticketScope: TicketScope;
  /** Empty = all environments. */
  inventoryEnvironments: string[];
  teamIds: string[];
}

export function can(user: Pick<AuthUser, 'permissions'>, permission: Permission): boolean {
  return user.permissions.includes(permission);
}

/** Whether a workflow role reference (role key such as "CAB" or base role such as "APPROVER") covers the user. */
export function matchesRole(user: Pick<AuthUser, 'role' | 'roleKey'>, ref: string): boolean {
  return user.role === 'ADMIN' || user.roleKey === ref || user.role === ref;
}

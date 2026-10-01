import 'dotenv/config';
import { Priority, PrismaClient, Role, TicketType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { SYSTEM_ROLES } from '../src/auth/permissions';

const prisma = new PrismaClient();

type Def = {
  initialStatus: string;
  statuses: { key: string; name: string; category: 'TODO' | 'IN_PROGRESS' | 'DONE'; pausesSla?: boolean }[];
  transitions: {
    key: string;
    name: string;
    from: string[];
    to: string;
    requiredFields?: string[];
    allowedRoles?: Role[];
    requireComment?: boolean;
    requiresApproval?: { approverRole: Role };
  }[];
};

const WORKFLOWS: { name: string; type: TicketType; description: string; def: Def }[] = [
  {
    name: 'Incident Management',
    type: 'INCIDENT',
    description: 'Restore service as quickly as possible. SLA pauses while waiting on the requester.',
    def: {
      initialStatus: 'new',
      statuses: [
        { key: 'new', name: 'New', category: 'TODO' },
        { key: 'triage', name: 'Triage', category: 'TODO' },
        { key: 'in_progress', name: 'In Progress', category: 'IN_PROGRESS' },
        { key: 'waiting_customer', name: 'Waiting on Requester', category: 'IN_PROGRESS', pausesSla: true },
        { key: 'resolved', name: 'Resolved', category: 'DONE' },
        { key: 'closed', name: 'Closed', category: 'DONE' },
        { key: 'cancelled', name: 'Cancelled', category: 'DONE' },
      ],
      transitions: [
        { key: 'triage', name: 'Triage', from: ['new'], to: 'triage', allowedRoles: ['AGENT'] },
        { key: 'start', name: 'Start work', from: ['new', 'triage'], to: 'in_progress', requiredFields: ['assigneeId'], allowedRoles: ['AGENT'] },
        { key: 'wait', name: 'Request info', from: ['in_progress'], to: 'waiting_customer', requireComment: true, allowedRoles: ['AGENT'] },
        { key: 'info_provided', name: 'Info provided', from: ['waiting_customer'], to: 'in_progress', allowedRoles: ['AGENT', 'REQUESTER'] },
        { key: 'resolve', name: 'Resolve', from: ['triage', 'in_progress'], to: 'resolved', requiredFields: ['category'], requireComment: true, allowedRoles: ['AGENT'] },
        { key: 'close', name: 'Close', from: ['resolved'], to: 'closed', allowedRoles: ['AGENT', 'REQUESTER'] },
        { key: 'reopen', name: 'Reopen', from: ['resolved'], to: 'in_progress', requireComment: true, allowedRoles: ['AGENT', 'REQUESTER'] },
        { key: 'cancel', name: 'Cancel', from: ['new', 'triage', 'in_progress', 'waiting_customer'], to: 'cancelled', requireComment: true },
      ],
    },
  },
  {
    name: 'Change Management',
    type: 'CHANGE',
    description: 'Planned changes to production. Scheduling requires Change Advisory approval.',
    def: {
      initialStatus: 'draft',
      statuses: [
        { key: 'draft', name: 'Draft', category: 'TODO' },
        { key: 'review', name: 'Peer Review', category: 'TODO' },
        { key: 'scheduled', name: 'Scheduled', category: 'IN_PROGRESS' },
        { key: 'implementing', name: 'Implementing', category: 'IN_PROGRESS' },
        { key: 'completed', name: 'Completed', category: 'DONE' },
        { key: 'failed', name: 'Failed / Rolled back', category: 'DONE' },
        { key: 'cancelled', name: 'Cancelled', category: 'DONE' },
      ],
      transitions: [
        { key: 'submit', name: 'Submit for review', from: ['draft'], to: 'review', requiredFields: ['customFields.rollbackPlan', 'customFields.changeWindow'] },
        { key: 'schedule', name: 'Approve & schedule', from: ['review'], to: 'scheduled', requiresApproval: { approverRole: 'APPROVER' }, allowedRoles: ['AGENT'] },
        { key: 'rework', name: 'Send back', from: ['review'], to: 'draft', requireComment: true },
        { key: 'implement', name: 'Begin implementation', from: ['scheduled'], to: 'implementing', requiredFields: ['assigneeId'], allowedRoles: ['AGENT'] },
        { key: 'complete', name: 'Mark completed', from: ['implementing'], to: 'completed', requireComment: true, allowedRoles: ['AGENT'] },
        { key: 'fail', name: 'Mark failed', from: ['implementing'], to: 'failed', requireComment: true, allowedRoles: ['AGENT'] },
        { key: 'cancel', name: 'Cancel', from: ['draft', 'review', 'scheduled'], to: 'cancelled', requireComment: true },
      ],
    },
  },
  {
    name: 'Service Request Fulfilment',
    type: 'SERVICE_REQUEST',
    description: 'Standard requests (access, new resources). Manager approval before fulfilment.',
    def: {
      initialStatus: 'submitted',
      statuses: [
        { key: 'submitted', name: 'Submitted', category: 'TODO' },
        { key: 'approved', name: 'Approved', category: 'TODO' },
        { key: 'in_progress', name: 'Fulfilling', category: 'IN_PROGRESS' },
        { key: 'resolved', name: 'Fulfilled', category: 'DONE' },
        { key: 'closed', name: 'Closed', category: 'DONE' },
        { key: 'rejected', name: 'Rejected', category: 'DONE' },
      ],
      transitions: [
        { key: 'request_approval', name: 'Request approval', from: ['submitted'], to: 'approved', requiresApproval: { approverRole: 'APPROVER' }, allowedRoles: ['AGENT'] },
        { key: 'reject', name: 'Reject', from: ['submitted'], to: 'rejected', requireComment: true, allowedRoles: ['APPROVER', 'AGENT'] },
        { key: 'fulfil', name: 'Start fulfilment', from: ['approved'], to: 'in_progress', requiredFields: ['assigneeId'], allowedRoles: ['AGENT'] },
        { key: 'resolve', name: 'Mark fulfilled', from: ['in_progress'], to: 'resolved', requireComment: true, allowedRoles: ['AGENT'] },
        { key: 'close', name: 'Close', from: ['resolved'], to: 'closed', allowedRoles: ['AGENT', 'REQUESTER'] },
      ],
    },
  },
  {
    name: 'Problem Management',
    type: 'PROBLEM',
    description: 'Root-cause analysis for recurring incidents.',
    def: {
      initialStatus: 'open',
      statuses: [
        { key: 'open', name: 'Open', category: 'TODO' },
        { key: 'investigating', name: 'Investigating', category: 'IN_PROGRESS' },
        { key: 'known_error', name: 'Known Error', category: 'IN_PROGRESS' },
        { key: 'resolved', name: 'Resolved', category: 'DONE' },
        { key: 'closed', name: 'Closed', category: 'DONE' },
      ],
      transitions: [
        { key: 'investigate', name: 'Investigate', from: ['open'], to: 'investigating', requiredFields: ['assigneeId'] },
        { key: 'known_error', name: 'Record known error', from: ['investigating'], to: 'known_error', requiredFields: ['customFields.rootCause'] },
        { key: 'resolve', name: 'Resolve', from: ['investigating', 'known_error'], to: 'resolved', requireComment: true },
        { key: 'close', name: 'Close', from: ['resolved'], to: 'closed' },
      ],
    },
  },
  {
    name: 'Task',
    type: 'TASK',
    description: 'Lightweight internal work items.',
    def: {
      initialStatus: 'todo',
      statuses: [
        { key: 'todo', name: 'To Do', category: 'TODO' },
        { key: 'in_progress', name: 'In Progress', category: 'IN_PROGRESS' },
        { key: 'done', name: 'Done', category: 'DONE' },
      ],
      transitions: [
        { key: 'start', name: 'Start', from: ['todo'], to: 'in_progress' },
        { key: 'done', name: 'Done', from: ['todo', 'in_progress'], to: 'done' },
        { key: 'reopen', name: 'Reopen', from: ['done'], to: 'todo' },
      ],
    },
  },
];

const SLA: Record<Priority, [number, number]> = {
  P1: [15, 240],
  P2: [60, 480],
  P3: [240, 4320],
  P4: [480, 10080],
};

async function main() {
  if ((await prisma.user.count()) > 0) {
    console.log('Base demo data already present — applying idempotent extras only.');
  } else {
    await seedBase();
  }
  await seedExtras();
}

async function seedBase() {

  const hash = (p: string) => bcrypt.hashSync(p, 10);
  const admin = await prisma.user.create({
    data: { email: 'admin@cloudguardian.local', name: 'Ada Admin', role: 'ADMIN', title: 'IT Operations Lead', passwordHash: hash('Admin@123') },
  });
  const pw = hash('Password@123');
  const mk = (email: string, name: string, role: Role, title: string, skills: string[] = []) =>
    prisma.user.create({ data: { email, name, role, title, skills, passwordHash: pw } });
  const alice = await mk('alice@cloudguardian.local', 'Alice Chen', 'AGENT', 'SRE', ['aws', 'kubernetes', 'networking']);
  const bob = await mk('bob@cloudguardian.local', 'Bob Martinez', 'AGENT', 'Platform Engineer', ['aws', 'terraform']);
  const carol = await mk('carol@cloudguardian.local', 'Carol Singh', 'AGENT', 'Security Engineer', ['iam', 'security']);
  const dave = await mk('dave@cloudguardian.local', 'Dave Okafor', 'AGENT', 'Data Engineer', ['databases', 'etl']);
  const erin = await mk('erin@cloudguardian.local', 'Erin Walsh', 'APPROVER', 'Change Manager');
  await mk('frank@cloudguardian.local', 'Frank Liu', 'VIEWER', 'Engineering Manager');
  const grace = await mk('grace@cloudguardian.local', 'Grace Kim', 'REQUESTER', 'Product Manager');

  const team = (name: string, description: string, members: string[]) =>
    prisma.team.create({ data: { name, description, members: { create: members.map((userId) => ({ userId })) } } });
  const platform = await team('Platform Ops', 'Compute, networking and load balancing', [alice.id, bob.id]);
  const security = await team('Security', 'IAM, compliance and security incidents', [carol.id]);
  const data = await team('Data Engineering', 'Databases and pipelines', [dave.id]);
  const desk = await team('Service Desk', 'First-line support and requests', [admin.id, alice.id]);

  const workflows: Record<string, string> = {};
  for (const w of WORKFLOWS) {
    const wf = await prisma.workflow.create({
      data: { name: w.name, ticketType: w.type, description: w.description, version: 1, isActive: true, definition: w.def },
    });
    workflows[w.type] = wf.id;
  }

  for (const [priority, [firstResponseMins, resolutionMins]] of Object.entries(SLA)) {
    await prisma.slaPolicy.create({ data: { priority: priority as Priority, firstResponseMins, resolutionMins } });
  }

  await prisma.automationRule.createMany({
    data: [
      { name: 'Route infrastructure tickets to Platform Ops', sortOrder: 10, conditions: { category: ['Infrastructure', 'Networking'] }, actions: { teamId: platform.id } },
      { name: 'Route security tickets to Security', sortOrder: 20, conditions: { titleContains: 'security' }, actions: { teamId: security.id, addTags: ['security'] } },
      { name: 'Route database tickets to Data Engineering', sortOrder: 30, conditions: { category: ['Database'] }, actions: { teamId: data.id } },
      { name: 'Tag P1 incidents as major incidents', sortOrder: 40, conditions: { type: ['INCIDENT'], priority: ['P1'] }, actions: { addTags: ['major-incident'] } },
      { name: 'Service requests go to Service Desk', sortOrder: 50, conditions: { type: ['SERVICE_REQUEST'] }, actions: { teamId: desk.id } },
    ],
  });

  const acme = await prisma.organization.create({
    data: {
      name: 'Acme Corp', domain: 'acme.example', tier: 'ENTERPRISE', industry: 'Manufacturing',
      contacts: { create: [
        { name: 'Wile E. Coyote', email: 'wile@acme.example', title: 'CTO', phone: '+1 555 0100' },
        { name: 'Road Runner', email: 'rr@acme.example', title: 'DevOps Lead' },
      ] },
    },
    include: { contacts: true },
  });
  const globex = await prisma.organization.create({
    data: {
      name: 'Globex', domain: 'globex.example', tier: 'PREMIUM', industry: 'Energy',
      contacts: { create: [{ name: 'Hank Scorpio', email: 'hank@globex.example', title: 'CEO' }] },
    },
    include: { contacts: true },
  });
  await prisma.organization.create({
    data: {
      name: 'Initech', domain: 'initech.example', tier: 'STANDARD', industry: 'Software',
      contacts: { create: [{ name: 'Peter Gibbons', email: 'peter@initech.example', title: 'Engineer' }] },
    },
  });

  // Live AWS accounts are connected in the UI (STS identity, access keys, or AssumeRole).

  const statusCat = (type: TicketType, status: string) =>
    WORKFLOWS.find((w) => w.type === type)!.def.statuses.find((s) => s.key === status)!.category;

  const samples: {
    title: string; description: string; type: TicketType; priority: Priority; status: string; category?: string;
    assignee?: string; team?: string; requester?: string; org?: string; contact?: string; daysAgo: number;
    tags?: string[]; customFields?: Record<string, string>; breached?: boolean; comments?: [string, string, boolean][];
  }[] = [
    { title: 'Checkout API returning 502s in us-east-1', description: 'Customers see intermittent 502 errors on checkout. Started ~10:05 UTC.', type: 'INCIDENT', priority: 'P1', status: 'in_progress', category: 'Infrastructure', assignee: alice.id, team: platform.id, org: acme.id, contact: acme.contacts[1].id, daysAgo: 0, tags: ['major-incident'],
      comments: [[alice.id, 'Investigating — target group prod-api-tg shows 1 unhealthy target.', false], [bob.id, 'Recent deploy at 09:58 looks suspicious, checking.', true]] },
    { title: 'VPN disconnects every 30 minutes', description: 'Remote staff are being dropped from the VPN roughly every half hour.', type: 'INCIDENT', priority: 'P2', status: 'waiting_customer', category: 'Networking', assignee: bob.id, team: platform.id, requester: grace.id, daysAgo: 1 },
    { title: 'Suspicious security group change on prod-auth', description: 'Port 22 opened to 0.0.0.0/0 on prod-auth-sg.', type: 'INCIDENT', priority: 'P1', status: 'resolved', category: 'Security', assignee: carol.id, team: security.id, daysAgo: 3, tags: ['security'] },
    { title: 'Replica lag on reporting database', description: 'Read replica is 20+ minutes behind primary.', type: 'INCIDENT', priority: 'P3', status: 'triage', category: 'Database', team: data.id, assignee: dave.id, org: globex.id, daysAgo: 2, breached: true },
    { title: 'Staging web tier slow after AMI update', description: 'p95 latency doubled after rolling new AMI.', type: 'INCIDENT', priority: 'P3', status: 'new', category: 'Infrastructure', daysAgo: 0 },
    { title: 'Upgrade prod ALB listeners to TLS 1.3 policy', description: 'Move all production ALBs to ELBSecurityPolicy-TLS13-1-2-2021-06.', type: 'CHANGE', priority: 'P3', status: 'review', category: 'Infrastructure', assignee: bob.id, team: platform.id, daysAgo: 2, customFields: { changeWindow: 'Sat 02:00–04:00 UTC', rollbackPlan: 'Revert listener policy via Terraform' } },
    { title: 'Resize prod-worker fleet to m6i.xlarge', description: 'Worker queue backlog growing during peak — scale up instance class.', type: 'CHANGE', priority: 'P2', status: 'draft', category: 'Infrastructure', assignee: alice.id, team: platform.id, daysAgo: 1 },
    { title: 'Access to production read-only console for Grace', description: 'Need read-only AWS console access for dashboards.', type: 'SERVICE_REQUEST', priority: 'P4', status: 'submitted', category: 'Access', requester: grace.id, team: desk.id, daysAgo: 1 },
    { title: 'New staging environment for Acme integration', description: 'Provision isolated staging stack for Acme API integration testing.', type: 'SERVICE_REQUEST', priority: 'P3', status: 'in_progress', category: 'Infrastructure', assignee: alice.id, team: desk.id, org: acme.id, contact: acme.contacts[0].id, daysAgo: 5 },
    { title: 'Recurring OOM kills on prod-search nodes', description: 'Search nodes OOM every few days. Linked incidents: 4 in the last month.', type: 'PROBLEM', priority: 'P2', status: 'investigating', category: 'Infrastructure', assignee: alice.id, team: platform.id, daysAgo: 9 },
    { title: 'Rotate IAM access keys older than 90 days', description: 'Quarterly key rotation.', type: 'TASK', priority: 'P3', status: 'in_progress', category: 'Security', assignee: carol.id, team: security.id, daysAgo: 4 },
    { title: 'Document load balancer runbooks', description: 'Write runbooks for common ALB failure modes.', type: 'TASK', priority: 'P4', status: 'todo', assignee: bob.id, team: platform.id, daysAgo: 6 },
    ...Array.from({ length: 10 }, (_, i) => ({
      title: `Password reset request #${i + 1}`,
      description: 'User locked out of SSO.',
      type: 'SERVICE_REQUEST' as TicketType,
      priority: 'P4' as Priority,
      status: 'closed',
      category: 'Access',
      assignee: alice.id,
      team: desk.id,
      daysAgo: 1 + (i % 12),
      breached: i % 5 === 0,
    })),
  ];

  for (const s of samples) {
    const createdAt = new Date(Date.now() - s.daysAgo * 86_400_000 - Math.floor(Math.random() * 6) * 3_600_000);
    const [resp, reso] = SLA[s.priority];
    const cat = statusCat(s.type, s.status);
    const resolvedAt = cat === 'DONE' ? new Date(createdAt.getTime() + (1 + Math.random() * 20) * 3_600_000) : null;
    await prisma.ticket.create({
      data: {
        title: s.title,
        description: s.description,
        type: s.type,
        priority: s.priority,
        status: s.status,
        statusCategory: cat,
        category: s.category,
        tags: s.tags ?? [],
        customFields: s.customFields ?? {},
        workflowId: workflows[s.type],
        requesterId: s.requester ?? admin.id,
        assigneeId: s.assignee,
        teamId: s.team,
        organizationId: s.org,
        contactId: s.contact,
        createdAt,
        responseDueAt: new Date(createdAt.getTime() + resp * 60_000),
        resolutionDueAt: new Date(createdAt.getTime() + reso * 60_000),
        firstRespondedAt: s.assignee ? new Date(createdAt.getTime() + 10 * 60_000) : null,
        resolvedAt,
        closedAt: s.status === 'closed' ? resolvedAt : null,
        slaBreached: s.breached ?? false,
        slaPausedAt: s.status === 'waiting_customer' ? new Date() : null,
        events: { create: [{ type: 'created', actorId: s.requester ?? admin.id, createdAt, data: { status: 'seed' } }] },
        comments: s.comments ? { create: s.comments.map(([authorId, body, internal]) => ({ authorId, body, internal })) } : undefined,
      },
    });
  }

  console.log('Base seed complete.');
}

/** Safe to run repeatedly: only creates what is missing. */
async function seedExtras() {
  // ─── Roles ─────────────────────────────────────────────────────────────
  for (const [key, def] of Object.entries(SYSTEM_ROLES)) {
    await prisma.roleDefinition.upsert({
      where: { key },
      create: { key, name: def.name, description: def.description, baseRole: key as Role, permissions: def.permissions, ticketScope: def.ticketScope, isSystem: true },
      update: { isSystem: true },
    });
  }
  const custom: { key: string; name: string; description: string; baseRole: Role; permissions: string[]; ticketScope: 'ALL' | 'TEAM' | 'OWN'; inventoryEnvironments?: string[] }[] = [
    {
      key: 'L1_SUPPORT',
      name: 'L1 Support',
      description: 'First-line agents: work their team’s queue, cannot edit priority or linked assets.',
      baseRole: 'AGENT',
      ticketScope: 'TEAM',
      permissions: ['tickets:read', 'tickets:create', 'tickets:comment', 'tickets:transition', 'tickets:assign', 'tickets:view_internal', 'inventory:read', 'reports:read', 'crm:read', 'kb:read', 'kb:write'],
    },
    {
      key: 'CONTRACTOR',
      name: 'Contractor',
      description: 'External engineers: only tickets assigned to or raised by them, staging inventory only.',
      baseRole: 'AGENT',
      ticketScope: 'OWN',
      inventoryEnvironments: ['staging'],
      permissions: ['tickets:read', 'tickets:comment', 'tickets:transition', 'tickets:view_internal', 'inventory:read', 'reports:read', 'kb:read'],
    },
    {
      key: 'CAB',
      name: 'Change Advisory Board',
      description: 'Approves production changes.',
      baseRole: 'APPROVER',
      ticketScope: 'ALL',
      permissions: ['tickets:read', 'tickets:comment', 'tickets:transition', 'tickets:view_internal', 'approvals:decide', 'inventory:read', 'reports:read', 'crm:read', 'kb:read'],
    },
    {
      key: 'KNOWLEDGE_MANAGER',
      name: 'Knowledge Manager',
      description: 'Agent who also publishes knowledge articles and curates the service catalog.',
      baseRole: 'AGENT',
      ticketScope: 'ALL',
      permissions: [...SYSTEM_ROLES.AGENT.permissions, 'kb:publish', 'catalog:manage'],
    },
  ];
  for (const r of custom) {
    await prisma.roleDefinition.upsert({
      where: { key: r.key },
      create: { ...r, inventoryEnvironments: r.inventoryEnvironments ?? [] },
      update: {},
    });
  }

  const mockAccounts = await prisma.awsAccount.findMany({ where: { mock: true }, select: { id: true } });
  if (mockAccounts.length) {
    await prisma.asset.updateMany({
      where: { awsAccountId: { in: mockAccounts.map((a) => a.id) }, deletedAt: null },
      data: { deletedAt: new Date(), state: 'deleted' },
    });
    await prisma.awsAccount.updateMany({ where: { mock: true, enabled: true }, data: { enabled: false } });
  }

  // Grant reports:read to existing roles that already see inventory (safe to re-run).
  const grantReports = await prisma.roleDefinition.findMany({
    where: { key: { not: 'REQUESTER' }, permissions: { has: 'inventory:read' }, NOT: { permissions: { has: 'reports:read' } } },
  });
  for (const r of grantReports) {
    await prisma.roleDefinition.update({ where: { id: r.id }, data: { permissions: [...r.permissions, 'reports:read'] } });
  }
  const roleId = async (key: string) => (await prisma.roleDefinition.findUniqueOrThrow({ where: { key } })).id;

  for (const u of await prisma.user.findMany({ where: { roleId: null } })) {
    await prisma.user.update({ where: { id: u.id }, data: { roleId: await roleId(u.role) } });
  }
  const setRole = async (email: string, key: string) => {
    const role = await prisma.roleDefinition.findUniqueOrThrow({ where: { key } });
    await prisma.user.updateMany({ where: { email }, data: { roleId: role.id, role: role.baseRole } });
  };
  await setRole('erin@cloudguardian.local', 'CAB');
  await setRole('carol@cloudguardian.local', 'KNOWLEDGE_MANAGER');

  const pw = bcrypt.hashSync('Password@123', 10);
  const desk = await prisma.team.findUnique({ where: { name: 'Service Desk' } });
  const platform = await prisma.team.findUnique({ where: { name: 'Platform Ops' } });
  const security = await prisma.team.findUnique({ where: { name: 'Security' } });
  const data = await prisma.team.findUnique({ where: { name: 'Data Engineering' } });
  const extraUsers = [
    { email: 'henry@cloudguardian.local', name: 'Henry Park', title: 'Service Desk Analyst', key: 'L1_SUPPORT', teamId: desk?.id },
    { email: 'ivy@cloudguardian.local', name: 'Ivy Novak', title: 'Contract DevOps Engineer', key: 'CONTRACTOR', teamId: platform?.id },
  ];
  for (const u of extraUsers) {
    if (await prisma.user.findUnique({ where: { email: u.email } })) continue;
    const role = await prisma.roleDefinition.findUniqueOrThrow({ where: { key: u.key } });
    await prisma.user.create({
      data: {
        email: u.email, name: u.name, title: u.title, passwordHash: pw, role: role.baseRole, roleId: role.id,
        teams: u.teamId ? { create: { teamId: u.teamId } } : undefined,
      },
    });
  }

  // Changes now need the CAB custom role to approve scheduling.
  const change = await prisma.workflow.findFirst({ where: { ticketType: 'CHANGE', isActive: true }, orderBy: { version: 'desc' } });
  const changeDef = change?.definition as unknown as Def | undefined;
  const schedule = changeDef?.transitions.find((t) => t.key === 'schedule');
  if (change && changeDef && schedule?.requiresApproval?.approverRole !== 'CAB') {
    schedule!.requiresApproval = { approverRole: 'CAB' as Role };
    await prisma.workflow.update({ where: { id: change.id }, data: { isActive: false } });
    await prisma.workflow.create({
      data: { name: change.name, ticketType: change.ticketType, description: change.description, version: change.version + 1, isActive: true, definition: changeDef },
    });
  }

  // ─── Business calendars & SLA ─────────────────────────────────────────
  const weekdays = (start: string, end: string) => ({ mon: [[start, end]], tue: [[start, end]], wed: [[start, end]], thu: [[start, end]], fri: [[start, end]], sat: [], sun: [] });
  const calendars = [
    { name: 'Singapore Office', timezone: 'Asia/Singapore', hours: weekdays('09:00', '18:00'), holidays: ['2026-01-01', '2026-02-17', '2026-02-18', '2026-04-03', '2026-05-01', '2026-08-10', '2026-12-25'], isDefault: true },
    { name: 'US East Office', timezone: 'America/New_York', hours: weekdays('08:00', '17:00'), holidays: ['2026-01-01', '2026-07-03', '2026-11-26', '2026-12-25'], isDefault: false },
    { name: '24x7 Operations', timezone: 'UTC', hours: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['00:00', '24:00']]])), holidays: [], isDefault: false },
  ];
  for (const c of calendars) {
    await prisma.businessCalendar.upsert({ where: { name: c.name }, create: c, update: {} });
  }
  const cal = async (name: string) => (await prisma.businessCalendar.findUniqueOrThrow({ where: { name } })).id;
  const user = async (email: string) => (await prisma.user.findUnique({ where: { email } }))?.id ?? null;
  const teamSetup: [typeof platform, string, string][] = [
    [platform, '24x7 Operations', 'alice@cloudguardian.local'],
    [desk, 'Singapore Office', 'admin@cloudguardian.local'],
    [security, 'US East Office', 'carol@cloudguardian.local'],
    [data, 'Singapore Office', 'dave@cloudguardian.local'],
  ];
  for (const [team, calName, lead] of teamSetup) {
    if (team && !team.calendarId) {
      await prisma.team.update({ where: { id: team.id }, data: { calendarId: await cal(calName), leadId: await user(lead) } });
    }
  }
  // Business-hour targets: P3 ≈ 3 working days, P4 ≈ 5 working days (9h days).
  const slaExtras: Record<Priority, { businessHours: boolean; warnBeforeMins: number; resolutionMins?: number }> = {
    P1: { businessHours: false, warnBeforeMins: 10 },
    P2: { businessHours: true, warnBeforeMins: 30 },
    P3: { businessHours: true, warnBeforeMins: 60, resolutionMins: 1620 },
    P4: { businessHours: true, warnBeforeMins: 120, resolutionMins: 2700 },
  };
  for (const [priority, v] of Object.entries(slaExtras)) {
    const p = await prisma.slaPolicy.findUnique({ where: { priority: priority as Priority } });
    if (p && p.warnBeforeMins === 30 && p.businessHours) {
      await prisma.slaPolicy.update({ where: { priority: priority as Priority }, data: v });
    }
  }

  if (!(await prisma.escalationPolicy.count())) {
    await prisma.escalationPolicy.createMany({
      data: [
        {
          name: 'Critical & high priority',
          priorities: ['P1', 'P2'],
          sortOrder: 10,
          levels: [
            { afterMins: 0, notify: ['assignee', 'team_lead'] },
            { afterMins: 30, notify: ['team', 'admins'], reassignToLead: true },
            { afterMins: 120, notify: ['admins'], bumpPriority: true },
          ],
        },
        {
          name: 'Standard',
          priorities: [],
          sortOrder: 20,
          levels: [
            { afterMins: 0, notify: ['assignee'] },
            { afterMins: 240, notify: ['team_lead'], bumpPriority: true },
          ],
        },
      ],
    });
  }

  // ─── Knowledge base ───────────────────────────────────────────────────
  const admin = await prisma.user.findFirstOrThrow({ where: { email: 'admin@cloudguardian.local' } });
  const carol = await prisma.user.findFirst({ where: { email: 'carol@cloudguardian.local' } });
  const alice = await prisma.user.findFirst({ where: { email: 'alice@cloudguardian.local' } });
  const cats = [
    ['Getting started', 'Accounts, access and first steps', 'rocket', 10],
    ['Network & VPN', 'Connectivity and remote access', 'wifi', 20],
    ['Accounts & passwords', 'SSO, MFA and password resets', 'key', 30],
    ['Cloud & infrastructure', 'AWS access, environments and resources', 'cloud', 40],
    ['Runbooks', 'Internal operational procedures', 'book', 50],
  ] as const;
  for (const [name, description, icon, sortOrder] of cats) {
    await prisma.kbCategory.upsert({ where: { name }, create: { name, description, icon, sortOrder }, update: {} });
  }
  const catId = async (name: string) => (await prisma.kbCategory.findUniqueOrThrow({ where: { name } })).id;

  const articles: { slug: string; title: string; category: string; visibility: 'PUBLIC' | 'INTERNAL'; status: 'PUBLISHED' | 'DRAFT' | 'IN_REVIEW'; tags: string[]; excerpt: string; body: string; author?: string }[] = [
    {
      slug: 'connect-to-the-corporate-vpn', title: 'How to connect to the corporate VPN', category: 'Network & VPN', visibility: 'PUBLIC', status: 'PUBLISHED', tags: ['vpn', 'remote', 'network'],
      excerpt: 'Install the client, sign in with SSO and pick the nearest gateway.',
      body: `## Before you start\n\n- You need an active SSO account with MFA enrolled.\n- Your laptop must be managed (company-issued).\n\n## Steps\n\n1. Install **GlobalConnect** from the Self Service app.\n2. Open it and enter the portal address \`vpn.cloudguardian.local\`.\n3. Sign in with SSO and approve the MFA prompt.\n4. Choose the gateway closest to you (Singapore, Virginia or Frankfurt).\n\n## Still stuck?\n\nSee [Troubleshooting VPN disconnects](/portal/kb/troubleshooting-vpn-disconnects) or raise a request.`,
    },
    {
      slug: 'troubleshooting-vpn-disconnects', title: 'Troubleshooting VPN disconnects', category: 'Network & VPN', visibility: 'PUBLIC', status: 'PUBLISHED', tags: ['vpn', 'disconnect', 'network', 'wifi'],
      excerpt: 'Dropping every 30 minutes? It is usually idle timeout, sleep settings or a flaky Wi-Fi band.',
      body: `If your VPN drops regularly (for example **every 30 minutes**), work through these checks:\n\n| Symptom | Likely cause | Fix |\n|---|---|---|\n| Drops exactly every 30 min | Session re-key blocked by home router | Update router firmware, disable "SIP ALG" |\n| Drops when laptop idles | Power saving turns off Wi-Fi | Disable Wi-Fi power saving |\n| Random drops on Wi-Fi | 2.4 GHz congestion | Switch to 5 GHz or use Ethernet |\n\n### Collect logs\n\nIn GlobalConnect choose **Settings → Troubleshooting → Collect logs** and attach the zip to your ticket.`,
    },
    {
      slug: 'reset-your-sso-password', title: 'Reset your SSO password or MFA device', category: 'Accounts & passwords', visibility: 'PUBLIC', status: 'PUBLISHED', tags: ['password', 'sso', 'mfa', 'locked', 'reset'],
      excerpt: 'Self-service reset at id.cloudguardian.local — no ticket needed for most cases.',
      body: `## Forgotten password\n\n1. Go to **id.cloudguardian.local** and click *Forgot password*.\n2. Verify with your registered phone or backup email.\n3. Choose a new password (14+ characters, no reuse of the last 10).\n\n## Locked out / lost MFA device\n\nUse the **Password / MFA Reset** item in the service catalog. The Service Desk will verify your identity by video call before resetting MFA.`,
    },
    {
      slug: 'request-aws-console-access', title: 'Requesting AWS console access', category: 'Cloud & infrastructure', visibility: 'PUBLIC', status: 'PUBLISHED', tags: ['aws', 'access', 'console', 'iam'],
      excerpt: 'Use the AWS Console Access catalog item. Read-only is approved same day; PowerUser needs manager approval.',
      body: `Access to AWS accounts is granted through IAM Identity Center permission sets.\n\n- **ReadOnly** — dashboards, logs and metrics. Usually approved the same business day.\n- **PowerUser** — create and modify resources (no IAM). Requires manager approval and expires after 30 days.\n\nRequest it from the portal: **Service catalog → AWS Console Access**. Include a short justification.`,
    },
    {
      slug: 'raise-a-production-change', title: 'How to raise a production change', category: 'Getting started', visibility: 'PUBLIC', status: 'PUBLISHED', tags: ['change', 'cab', 'production', 'deployment'],
      excerpt: 'Every production change needs a change window, rollback plan and CAB approval.',
      body: `1. Create a ticket of type **Change**.\n2. Fill in the **change window** and **rollback plan** — the workflow will not let you submit without them.\n3. *Submit for review* → a peer reviews the plan.\n4. *Approve & schedule* sends it to the **Change Advisory Board**. You'll get a notification (and a Slack message) when it is approved.\n5. During the window: *Begin implementation*, then *Mark completed* or *Mark failed*.`,
    },
    {
      slug: 'runbook-alb-unhealthy-targets', title: 'Runbook: ALB target group has unhealthy targets', category: 'Runbooks', visibility: 'INTERNAL', status: 'PUBLISHED', tags: ['alb', 'load-balancer', 'unhealthy', 'target-group', '502', 'runbook'], author: 'alice',
      excerpt: 'Triage 502s and failing health checks behind an Application Load Balancer.',
      body: `CloudGuardian opens an incident automatically when a target group reports unhealthy targets.\n\n## 1. Confirm impact\n- Check the LB's \`HTTPCode_ELB_5XX_Count\` and \`UnHealthyHostCount\` in CloudWatch.\n- Open the target group in **Inventory** to see which instances fail and the reason code.\n\n## 2. Common reason codes\n| Reason | Meaning | Action |\n|---|---|---|\n| \`Target.ResponseCodeMismatch\` | App returned non-2xx on \`/healthz\` | Check app logs, recent deploys |\n| \`Target.Timeout\` | No response in time | CPU/memory saturation, security group rules |\n| \`Target.FailedHealthChecks\` | Connection refused | Service not listening on the port |\n\n## 3. Mitigate\n- Roll back the last deployment if it correlates.\n- Deregister the bad instance; the ASG will replace it.\n\n## 4. Close out\nLink the affected assets on the incident and record the root cause.`,
    },
    {
      slug: 'runbook-read-replica-lag', title: 'Runbook: database read replica lag', category: 'Runbooks', visibility: 'INTERNAL', status: 'PUBLISHED', tags: ['database', 'replica', 'lag', 'rds', 'runbook'],
      excerpt: 'What to check when a read replica falls behind the primary.',
      body: `1. Check \`ReplicaLag\` in CloudWatch and confirm the trend.\n2. Look for long-running queries on the replica (\`pg_stat_activity\`).\n3. Check replica instance class vs primary write throughput.\n4. If lag > 30 min, route reporting traffic back to the primary's reader endpoint temporarily.`,
    },
    {
      slug: 'request-a-staging-environment', title: 'Requesting a staging environment', category: 'Cloud & infrastructure', visibility: 'PUBLIC', status: 'IN_REVIEW', tags: ['staging', 'environment'],
      excerpt: 'Draft guide for requesting an isolated staging stack.',
      body: `Use the **New Staging Environment** catalog item. Provisioning takes 1–2 business days.`,
    },
  ];
  for (const a of articles) {
    if (await prisma.kbArticle.findUnique({ where: { slug: a.slug } })) continue;
    const authorId = (a.author === 'alice' ? alice?.id : carol?.id) ?? admin.id;
    await prisma.kbArticle.create({
      data: {
        slug: a.slug, title: a.title, body: a.body, excerpt: a.excerpt, tags: a.tags, visibility: a.visibility, status: a.status,
        categoryId: await catId(a.category), authorId,
        publishedAt: a.status === 'PUBLISHED' ? new Date() : null,
        views: a.status === 'PUBLISHED' ? Math.floor(Math.random() * 200) : 0,
        helpfulYes: a.status === 'PUBLISHED' ? Math.floor(Math.random() * 30) : 0,
        versions: { create: { version: 1, title: a.title, body: a.body, editorId: authorId } },
      },
    });
  }

  // ─── Service catalog ──────────────────────────────────────────────────
  if (!(await prisma.catalogItem.count())) {
    await prisma.catalogItem.createMany({
      data: [
        {
          name: 'AWS Console Access', icon: 'cloud', category: 'Access', priority: 'P3', teamId: desk?.id, sortOrder: 10,
          description: 'Request read-only or power-user access to an AWS account.',
          fields: [
            { key: 'account', label: 'AWS account', type: 'select', required: true, options: ['Demo Production', 'Demo Staging'] },
            { key: 'accessLevel', label: 'Access level', type: 'select', required: true, options: ['ReadOnly', 'PowerUser'] },
            { key: 'duration', label: 'Duration', type: 'select', required: true, options: ['1 day', '1 week', '30 days'] },
            { key: 'justification', label: 'Business justification', type: 'textarea', required: true },
          ],
        },
        {
          name: 'Password / MFA Reset', icon: 'key', category: 'Access', priority: 'P2', teamId: desk?.id, sortOrder: 20,
          description: 'Locked out or lost your MFA device? We will verify your identity and reset it.',
          fields: [
            { key: 'system', label: 'System', type: 'select', required: true, options: ['SSO', 'VPN', 'AWS'] },
            { key: 'lostDevice', label: 'I lost my MFA device', type: 'checkbox' },
            { key: 'contactNumber', label: 'Phone number for verification', type: 'text', required: true },
          ],
        },
        {
          name: 'New EC2 Instance', icon: 'server', category: 'Infrastructure', priority: 'P3', teamId: platform?.id, sortOrder: 30,
          description: 'Provision a new EC2 instance in a managed VPC.',
          fields: [
            { key: 'environment', label: 'Environment', type: 'select', required: true, options: ['staging', 'prod'] },
            { key: 'instanceType', label: 'Instance type', type: 'select', required: true, options: ['t3.medium', 't3.large', 'm6i.large', 'm6i.xlarge'] },
            { key: 'count', label: 'Number of instances', type: 'number', required: true },
            { key: 'publicIp', label: 'Needs a public IP', type: 'checkbox', help: 'Requires Security review' },
            { key: 'purpose', label: 'What will it run?', type: 'textarea', required: true },
          ],
        },
        {
          name: 'New Staging Environment', icon: 'layers', category: 'Infrastructure', priority: 'P3', teamId: platform?.id, sortOrder: 40,
          description: 'An isolated staging stack (VPC, ALB, app tier) for integration testing.',
          fields: [
            { key: 'project', label: 'Project / customer', type: 'text', required: true },
            { key: 'neededBy', label: 'Needed by (date)', type: 'text', required: true },
            { key: 'notes', label: 'Anything else?', type: 'textarea' },
          ],
        },
        {
          name: 'Database Access', icon: 'database', category: 'Access', priority: 'P3', teamId: data?.id, sortOrder: 50,
          description: 'Read access to reporting or application databases.',
          fields: [
            { key: 'database', label: 'Database', type: 'select', required: true, options: ['reporting', 'billing (read replica)', 'search'] },
            { key: 'justification', label: 'Justification', type: 'textarea', required: true },
          ],
        },
        {
          name: 'Security Review', icon: 'shield', category: 'Security', ticketType: 'TASK', priority: 'P3', teamId: security?.id, sortOrder: 60, visibleToRequesters: false,
          description: 'Ask the Security team to review a design, change or vendor.',
          fields: [
            { key: 'subject', label: 'What should we review?', type: 'text', required: true },
            { key: 'link', label: 'Design doc link', type: 'text' },
            { key: 'deadline', label: 'Deadline', type: 'text' },
          ],
        },
      ],
    });
  }

  console.log('Extras applied (roles, calendars, escalations, knowledge base, catalog).');
  console.log('  Admin:      admin@cloudguardian.local / Admin@123');
  console.log('  Others (Password@123): alice, bob, dave (agents) · carol (knowledge manager) · erin (CAB) · frank (viewer)');
  console.log('                         grace (requester) · henry (L1 support) · ivy (contractor)  — all @cloudguardian.local');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

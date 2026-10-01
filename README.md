# CloudGuardian

Internal CRM for IT operations: ticketing with configurable workflows, SLAs and approvals; AWS inventory (EC2, load balancers, target groups) collected automatically; user, team and customer management.

## Stack

| Layer | Tech |
|---|---|
| Web | Next.js 15 (React 19), Tailwind CSS 4, TanStack Query |
| API | NestJS 11 (TypeScript), class-validator, JWT auth, RBAC guard |
| Database | PostgreSQL 16 via Prisma 6 |
| Jobs | BullMQ on Redis (AWS inventory sync), `@nestjs/schedule` (SLA breach checks, auto-close, scheduled syncs) |
| AWS | AWS SDK v3 — STS AssumeRole (external ID) → EC2 / ELBv2 read-only APIs |

```
apps/
  api/   NestJS API + workers        (http://localhost:4000/api)
  web/   Next.js frontend            (http://localhost:3000)
docker-compose.yml   Postgres + Redis for local dev
```

## Getting started

Requirements: Node 20+, Docker.

```bash
npm install
npm run infra:up                             # Postgres + Redis
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
npm run db:migrate                           # applies migrations
npm run db:seed                              # demo data
npm run dev                                  # API :4000 + web :3000
```

Sign in at http://localhost:3000 — the login page has one-click demo accounts:

| Role | Email | Password |
|---|---|---|
| Administrator | admin@cloudguardian.local | Admin@123 |
| Agent | alice@ / bob@ / dave@cloudguardian.local | Password@123 |
| Knowledge Manager (custom) | carol@cloudguardian.local | Password@123 |
| Change Advisory Board (custom approver) | erin@cloudguardian.local | Password@123 |
| L1 Support (custom, team-scoped) | henry@cloudguardian.local | Password@123 |
| Contractor (custom, own tickets + staging only) | ivy@cloudguardian.local | Password@123 |
| Viewer | frank@cloudguardian.local | Password@123 |
| Requester (self-service portal) | grace@cloudguardian.local | Password@123 |

AWS inventory and reports stay empty until you connect a live AWS account under **AWS Accounts**. Demo/synthetic AWS data is disabled.

`npm run db:reset` drops and re-seeds the database. `npm run db:seed` is safe to re-run: it only adds missing demo data.

## Features

**Tickets**
- Types: Incident, Service Request, Change, Problem, Task — each with its own workflow.
- Workflow engine: admin-defined statuses and transitions with role restrictions, required fields (`assigneeId`, `category`, `customFields.*`), mandatory comments, and **approval gates**. Workflows are versioned; in-flight tickets stay on the version they started with.
- SLAs per priority (first response + resolution), tighter for Premium (×0.75) / Enterprise (×0.5) customers, paused in "waiting" statuses.
- **Business-hours calendars** (timezone, weekly hours, holidays) assigned per team, with a default calendar; each SLA policy can count business hours or run 24×7.
- **Pre-breach warnings** ("warn before" per priority) and **escalation policies**: multi-level chains after a breach that notify the assignee / team / team lead / admins / named people, reassign to the team lead, or raise priority.
- Automation rules on create (match type / priority / category / title → set team, assignee, priority, tags) plus round-robin assignment within teams.
- Public replies vs internal notes, `@email` mentions, full event history, linked AWS resources, parent/child tickets, custom fields, list + board views, auto-close of resolved tickets after 7 days.

**AWS inventory**
- Connect a live account three ways: this API’s AWS credential chain (STS GetCallerIdentity), IAM access keys (verified then stored; the secret is never returned), or a cross-account AssumeRole with a generated CloudFormation template and external ID.
- Collects EC2 instances, ALB/NLB load balancers (with listeners), target groups (with per-target health), IAM users (console access, MFA, access keys, groups) and their relationships.
- Scheduled + on-demand syncs via a BullMQ worker, drift history per asset (added / modified / removed with field-level diffs), owner/environment mapped from tags.
- Automatically opens an incident when a target group has unhealthy targets (one open ticket per target group).

**Users, roles & permissions**
- **Custom roles** built from fine-grained permissions (view/create/comment/transition/edit/assign tickets, internal notes, approvals, inventory, reports, CRM, knowledge, catalog, admin areas).
- **Data scoping** per role: ticket visibility (all / team / own) and inventory environments (e.g. contractors see staging only). Enforced in the API for lists, detail, search and dashboards.
- Five system roles (Administrator is locked to full access); workflows can reference custom role keys in `allowedRoles` and `requiresApproval.approverRole` (e.g. `CAB`).
- User and team management (team leads, calendars), password reset/change, audit log of every administrative action, in-app notifications.

**Knowledge base, portal & service catalog**
- Markdown articles with categories, tags, public vs internal visibility, draft → review → publish workflow, version history, views and helpful/not-helpful feedback.
- Relevance-ranked **article suggestions** on tickets (agents) and while typing a new ticket (deflection).
- **Self-service portal** (`/portal`) for requesters: search, popular articles, service catalog, report a problem, track requests and reply. Requesters are redirected there automatically.
- **Service catalog** items with custom form builders (text, textarea, select, number, checkbox); submissions validate fields and create tickets routed to the item's team.

**Slack & Microsoft Teams**
- Per-channel incoming webhooks with event, priority and team filters; events for ticket created/assigned/status changed, SLA warning/breach/escalation, approval requested/decided, article published. Test button and delivery status; webhook URLs are never returned by the API.
- Slack app: `/cg new|status|mine` slash command and **Approve / Reject buttons** on approval messages. Requests are verified with the Slack signing secret and users are matched by email.

**Reports** (`/reports`, permission `reports:read`)
- **CloudWatch alarms** — interactive pie chart by state (OK / ALARM / INSUFFICIENT_DATA), namespace breakdown, filterable alarm table. Live via `DescribeAlarms` when the account is not in demo mode.
- **AWS Backup** — vaults, protected resources, recovery points, 24-hour job success/fail/running and recent jobs. Live via Backup list APIs.
- **Trend Micro** — agent online/offline/error pie, module coverage (anti-malware, IPS, integrity, firewall, web reputation, log inspection), computers and recent threats. Live when `TRENDMICRO_API_URL` + `TRENDMICRO_API_KEY` are set (Cloud One Workload Security); otherwise the tab stays empty.
- **AWS Inspector** — active findings by severity pie, type breakdown, CVE/CVSS table. Live via Inspector2 `ListFindings`.
- Reports stay empty until a live AWS account is connected. Collection errors are shown instead of invented data. Results are cached for 5 minutes; Refresh bypasses the cache.

**CRM & UX**
- Organizations (with tier) and contacts, customer ticket history.
- Dashboard (volume trend, SLA compliance, MTTR, backlog by priority/team, inventory health), ⌘K global search, dark mode.

## Connecting a real AWS account

Open **AWS Accounts → Connect AWS** and pick one path:

1. **This environment** — the API calls STS `GetCallerIdentity` with its default credential chain (`AWS_ACCESS_KEY_ID` / instance role / shared config). Connect & sync if an identity is found.
2. **Access keys** — paste a key, secret, and optional session token. **Verify with STS** checks the account, then CloudGuardian stores the keys (the secret is never returned by the API) and syncs.
3. **Assume role** — enter the 12-digit account ID and a read-only role ARN. Deploy the in-app CloudFormation template (external ID enforced) in the target account first. Set `CLOUDGUARDIAN_PRINCIPAL_ARN` so the template trusts this API.

After connect, a sync pulls EC2, load balancers, target groups and IAM users. Reports call CloudWatch, Backup and Inspector with the same credentials. Use **Sync** anytime to refresh.

## Configuration (`apps/api/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | local Postgres | Prisma connection string |
| `REDIS_URL` | `redis://localhost:6379` | BullMQ queue |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | — / `12h` | Auth tokens |
| `RUN_WORKERS` | `true` | Run sync worker + schedulers in this process (set `false` on API-only replicas) |
| `AWS_SYNC_CRON` | `0 */6 * * *` | Full inventory sync schedule |
| `AUTO_TICKETS` | `true` | Open incidents for unhealthy targets |
| `AUTO_CLOSE_DAYS` | `7` | Days before resolved tickets auto-close |
| `CLOUDGUARDIAN_PRINCIPAL_ARN` | — | Trusted principal in the onboarding template |
| `APP_URL` / `API_PUBLIC_URL` | localhost | Links in chat messages; Slack request URLs |
| `SLACK_SIGNING_SECRET` / `SLACK_BOT_TOKEN` | — | Enable the Slack slash command and interactive approvals |
| `TRENDMICRO_API_URL` / `TRENDMICRO_API_KEY` | — | Cloud One Workload Security API for the Trend Micro report |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` | — | Default credential chain for “This environment” AWS connections |

## Deploying to AWS EKS (GitLab CI/CD)

Both apps ship as containers to a small EKS cluster. Terraform creates the infrastructure, GitLab CI builds and pushes images to ECR, and a Helm chart deploys them. Everything sits behind one ALB: `/api` goes to the API and everything else to the web app, so the browser calls the API on the same origin. The web image is built with `NEXT_PUBLIC_API_URL=/api`.

```
infra/terraform/
  bootstrap/              one-time: GitLab OIDC provider + CI role (run from your laptop)
  environments/prod/      everything else (run by CI, state stored in GitLab)
  modules/
    network/              VPC, 2 public + 2 private subnets, optional single NAT gateway
    eks/                  cluster (access entries, standard support only), Spot node group, managed add-ons
    ecr/                  cloudguardian/api, cloudguardian/web with lifecycle cleanup
    rds/                  PostgreSQL 16, db.t4g.micro, single-AZ, encrypted, private
    alb-controller/       AWS Load Balancer Controller (Helm) with EKS Pod Identity
    app-runtime/          namespace, app secret (DATABASE_URL, JWT/Redis secrets), API pod AWS role
    gitlab-oidc/          IAM OIDC provider + role trusted only for your project's main branch
deploy/helm/cloudguardian/  api, web, redis, ALB ingress, pre-upgrade `prisma migrate deploy` job
apps/{api,web}/Dockerfile   build from the repo root
.gitlab-ci.yml              validate → infra (plan, manual apply) → build → deploy
```

### First-time setup

1. **Bootstrap the CI role.** Run this once with admin AWS credentials. It needs Terraform 1.10 or later.
   ```bash
   cd infra/terraform/bootstrap
   terraform init
   terraform apply -var project_path=<group>/<project> -var region=us-east-1
   ```
   Keep the local `terraform.tfstate`; it is small and ignored by git. Set `create_oidc_provider=false` if the account already trusts `gitlab.com`.
2. **Configure GitLab.** Under Settings → CI/CD → Variables, add `AWS_ROLE_ARN` with the `ci_role_arn` output, and mark it Protected. Protect the `main` branch. If you're not using `us-east-1`, change `AWS_REGION` in `.gitlab-ci.yml`.
   - Optional: `TF_VAR_admin_principal_arns`, for example `["arn:aws:iam::123456789012:role/Admin"]`, gives your own role kubectl access.
   - Optional: `APP_HOST` and `ACM_CERTIFICATE_ARN` enable a hostname with HTTPS.
3. **Push to `main`, then click `terraform:apply`.** The first apply takes about 15–20 minutes, because the EKS cluster and RDS take a while to create.
4. **Retry `build:*` and `deploy`.** On the first pipeline these fail because the ECR repositories don't exist until after the apply. After that, every push to `main` builds images tagged with the commit SHA and runs `helm upgrade`, which runs database migrations first.
5. **Get the app URL** with `kubectl -n cloudguardian get ingress cloudguardian`, or the command in the deploy log. If you set `APP_HOST`, point a CNAME at that hostname.
6. **Seed data (optional).** The manual `seed:demo-data` job loads the demo data, including the admin user. Those accounts use the well-known passwords listed above, so change them right away.

Merge requests run the typecheck, `terraform fmt`/`validate` and `helm lint` without AWS access.

The API pods get read-only AWS permissions through EKS Pod Identity: EC2, ELB, IAM users, CloudWatch alarms, Backup, Inspector, and `sts:AssumeRole` into `CloudGuardianInventory*` roles. So **AWS Accounts → This environment** connects the hosting account with no keys. To add API secrets such as Slack or Trend Micro, pass `TF_VAR_app_secret_env` as a masked JSON map. They're added to the `cloudguardian-api` secret.

### Cost (us-east-1, approx. per month)

| Item | Cost |
|---|---|
| EKS control plane | $73 |
| 2 × t3.medium / t3a.medium **Spot** nodes + 2 × 20 GB gp3 | ~$22 |
| RDS db.t4g.micro + 20 GB gp3 | ~$14 |
| ALB (one, shared via `ingress.groupName`) | ~$18 |
| Public IPv4 addresses (nodes + ALB) | ~$15 |
| ECR storage, CloudWatch (control-plane logs off) | ~$1 |
| **Total** | **~$140** |

These choices keep the cost low:
- There's no NAT gateway; nodes run in public subnets and RDS stays private. `enable_nat_gateway = true` adds about $33 a month.
- Nodes are Spot instances, and Redis runs in-cluster instead of ElastiCache.
- RDS is single-AZ.
- The cluster's `upgrade_policy` is set to `STANDARD`, so it never moves to extended support, which costs 6× as much.

Scale `node_desired_size` down to 1 to save about $10 more, at the cost of downtime during Spot interruptions.

### Hardening backlog (not done yet)

- Replace `AdministratorAccess` on the CI role with a scoped policy or a permissions boundary.
- Put nodes in private subnets behind NAT or VPC endpoints.
- Restrict `eks_public_access_cidrs`, or use your own runners.
- Add WAF on the ALB, NetworkPolicies, External Secrets or Secrets Manager, and RDS IAM auth.
- Make the database Multi-AZ and add PodDisruptionBudgets.
- Add Cluster Autoscaler or Karpenter, and a slimmer API image (it currently keeps dev dependencies for migrations and seeding).

### Tearing down

Uninstall the Helm release first, so the controller deletes the ALB: `helm -n cloudguardian uninstall cloudguardian`. Then apply with `TF_VAR_allow_destroy=true`, and run `terraform destroy`.

## Not yet implemented

SSO (OIDC/SAML) and SCIM, attachments (S3), email-to-ticket and outbound email, field-level security, EventBridge near-real-time inventory updates, OpenSearch, AI assist, and automated tests.

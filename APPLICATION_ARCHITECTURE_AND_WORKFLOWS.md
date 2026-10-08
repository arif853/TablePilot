# TablePilot: Full Application Architecture and Workflows

Last updated: 2026-04-05

## 1. Purpose and scope

This document explains the complete architecture of the application and the workflow of all major features, based on the current implementation in this repository.

It covers:
- System architecture (frontend, backend, data, real-time, jobs)
- Multi-tenancy and security flow
- API topology and request lifecycle
- Domain model and entity relationships
- Feature-by-feature workflows
- Operational workflows (scheduler, queue, deployment, tests)

## 2. System architecture overview

### 2.1 Runtime topology

The platform is a multi-tenant Restaurant SaaS built as:
- Frontend: React 18 SPA (Vite + Tailwind)
- Backend: Laravel 12 API
- Auth: JWT via php-open-source-saver/jwt-auth
- Database: MySQL (or compatible SQL DB)
- Real-time: Laravel broadcasting with Pusher channels
- Async: Laravel queue jobs + scheduler

High-level flow:

1. Browser/mobile app loads React SPA.
2. SPA calls `/api` endpoints using Axios with JWT bearer token where required.
3. Laravel middleware applies JSON normalization, auth, tenant checks, subscription checks, role checks.
4. Controllers call Eloquent models and services (Billing, VAT, AI, etc.).
5. Domain events broadcast updates to kitchen/dashboard/customer tracking listeners.
6. Scheduled jobs run periodic business automation (subscription expiry, settlement, stale order cancellation).

### 2.2 Frontend architecture

Frontend routing is role-aware:
- Public customer: menu/cart/order tracking
- Restaurant dashboard: admin/staff features
- Kitchen screen: live kitchen queue
- Super admin dashboard: platform-level controls

Frontend state and data stack:
- Zustand: auth/cart/branding/POS local state
- TanStack Query: server state and polling
- Axios interceptors: attach JWT, handle 401 logout, handle 402 subscription/trial expiry redirect

### 2.3 Backend architecture

Backend follows layered patterns:
- Routes -> middleware stacks -> controllers -> services/models
- `BaseApiController` ensures consistent JSON response shape
- Eloquent models + global tenant scope for data isolation
- Service classes for complex business logic (BillingService, VatCalculationService, AI services)

### 2.4 Real-time architecture

Broadcasted events:
- `NewOrderCreated`
- `OrderStatusUpdated`
- `MenuItemAvailabilityChanged`
- `TableTransferred`

Channels:
- Private: `tenant.{tenantId}.orders`
- Public: `tenant.{tenantId}.menu`
- Public: `order.{orderNumber}`

### 2.5 Batch/automation architecture

Scheduler jobs:
- `CheckSubscriptionExpiry` (daily 00:05)
- `SendSubscriptionExpiryWarnings` (daily 09:00)
- `AutoCancelStaleOrders` (every 5 min)
- `CalculateSettlement` (monthly day 1 at 02:00)

## 3. Request lifecycle and middleware pipeline

### 3.1 API defaults

All API requests are forced to JSON format by middleware.

Global API behavior includes:
- API throttling
- JSON exception rendering for auth/validation/not-found/method/rate-limit/access-denied/unexpected errors

### 3.2 Route topology

API is mounted in two equivalent namespaces:
- `/api/*` (backward compatible)
- `/api/v1/*` (versioned)

Unversioned stable routes:
- Public health endpoint
- Payment gateway callback endpoints

### 3.3 Middleware composition

Core middleware aliases:
- `auth:api`: JWT auth
- `tenant`: ensure tenant-linked active account (super admin bypass)
- `subscription`: ensure active subscription or active trial (super admin bypass)
- `role:*`: role-based authorization
- `wifi.validate`: optional tenant-configured network restriction for customer ordering
- `json`: force JSON responses

Typical tenant protected route stack:

1. `auth:api`
2. `tenant`
3. `subscription`
4. `role:*` (where required)

## 4. Multi-tenancy and authorization model

### 4.1 Tenant isolation

Tenant-scoped models use:
- Trait: `BelongsToTenant`
- Global scope: `TenantScope`

Effect:
- For authenticated non-super-admin users, queries are automatically filtered by `tenant_id`.
- On model creation, `tenant_id` is auto-assigned from authenticated user when applicable.

### 4.2 Role model

Roles:
- `super_admin`
- `restaurant_admin`
- `staff`
- `kitchen`

Authorization principles:
- Super admin has global access and bypasses tenant/subscription gates.
- Restaurant users are tenant-bound.
- Fine-grained role middleware protects sensitive actions (plans, system, subscriptions, POS access, etc.).

### 4.3 Subscription access control

Tenant access is granted when either is true:
- Active paid subscription exists
- Free trial window is still active

Expired trial/subscription behavior:
- API returns payment-required style response with status 402 and metadata for UI redirect.

## 5. Domain model architecture

Core entities:
- `Tenant`
- `User`
- `Subscription`, `SubscriptionPlan`
- `RestaurantTable`
- `Category`, `MenuItem`
- `Order`, `OrderItem`
- `Voucher`
- `Settlement`, `SettlementPayment`
- `Announcement`
- `ContactEnquiry`
- `AuditLog`
- AI models: `AIConversation`, `AIUsageLog`, `AITenantSettings`, `MenuItemEmbedding`

Key relationships:
- Tenant has many users, tables, categories, menu items, vouchers, orders, subscriptions, settlements.
- Order belongs to tenant, optional table, optional voucher; has many order items.
- Settlement has many settlement payments.
- Announcement has many read users via pivot.

Order lifecycle statuses:
- `placed -> confirmed -> preparing -> ready -> served -> completed`
- Cancellation can occur from non-completed states.

Payment statuses:
- `pending`, `paid`, `failed`, `refunded`

Order types:
- customer flow: `dine`, `parcel`
- POS flow adds: `quick`

## 6. Service-layer architecture

### 6.1 Billing and financial services

- `BillingService`
	- Orchestrates transactional order creation
	- Validates items/table
	- Applies voucher
	- Calculates VAT/totals
	- Generates sequential invoice number
	- Creates order + order items atomically
	- Marks table occupied for dine-in

- `VatCalculationService`
	- Supports VAT-inclusive and VAT-exclusive calculation modes
	- Uses `bcmath` precision-safe math

- `InvoiceNumberService`
	- Generates atomic sequential invoice numbers with DB lock

- `VatReportService`
	- Builds daily and monthly VAT reports from stored order fields

### 6.2 AI services

- `GeminiService`
	- Provider integration, chat + JSON mode + embeddings
	- Per-tenant and global rate limiting
	- Response caching
	- Usage logging

- `AnalyticsAssistantService`
	- Intent classification and tenant analytics context generation
	- Natural language business Q&A and proactive insights

- `SalesForecastService`
	- Statistical forecast with AI-enhanced recommendations

- `RecommendationService`
	- Time-based + popular + complementary + AI-assisted recommendations

- `CustomerChatbotService`
	- Customer assistant with context gathering and fallback response logic

- `MenuDescriptionService`
	- Single, batch, alternatives, improvement generation with fallback templates

- `SentimentAnalysisService`
	- Rule-based and AI-based sentiment scoring, trends, and negative feedback extraction

## 7. Complete feature workflows

### 7.1 Authentication workflow

1. User submits email/password to `/api/auth/login`.
2. Credentials are validated and JWT is issued.
3. User status must be active.
4. Frontend persists token/user in Zustand persisted storage.
5. Axios sends bearer token on future requests.

Registration workflow (current implementation):
1. Public register endpoint creates `restaurant_admin` user with `pending` status.
2. JWT is issued.
3. User can proceed to onboarding APIs to create tenant and activate account.

### 7.2 Restaurant onboarding workflow

Step A: Setup restaurant
1. Authenticated restaurant admin without `tenant_id` calls setup endpoint.
2. Tenant record is created with slug, trial period, default settings.
3. User is linked to tenant and activated.
4. Welcome email is attempted.

Step B: Subscribe
1. User selects plan.
2. System creates pending payment context in cache.
3. If payment gateway is enabled, redirect URL is returned.
4. Callback/IPN validates transaction and activates subscription.
5. Existing active subscriptions are expired before new one activation.

### 7.3 Subscription lifecycle workflow

Manual/admin creation:
1. Super admin creates subscription for tenant.
2. Existing active subscription is expired.
3. Tenant is re-activated.

Renewal:
1. Tenant initiates renewal payment.
2. Gateway callback or manual path creates active subscription.

Expiry:
1. Daily expiry job marks overdue subscriptions expired.
2. If no active alternative exists, tenant is deactivated.
3. Warning and expiry emails are sent to tenant admins.

### 7.4 Menu and category management workflow

1. Restaurant admin creates categories and menu items.
2. Menu item images are uploaded to storage.
3. Availability toggles broadcast real-time updates to customer clients.
4. Soft-delete/restore flow is supported for menu items.

### 7.5 Table and QR workflow

1. Restaurant admin/staff create tables.
2. QR URL is generated linking customer route with tenant slug + table context.
3. Separate parcel QR can be generated for take-away journey.
4. Table transfer can move active orders from one table to another.
5. Transfer event is broadcast for dashboard synchronization.

### 7.6 Customer ordering workflow (QR/public)

1. Customer opens `/restaurant/:slug` from QR or direct link.
2. Customer menu is loaded (active categories/items only).
3. Customer builds cart, applies voucher, chooses order type and payment method.
4. Order submission validates:
	 - Tenant active
	 - Subscription/trial available
	 - Optional tenant WiFi enforcement
	 - Item availability and quantities
5. Order is created through `BillingService` transaction.
6. `NewOrderCreated` is broadcast to tenant order channel.
7. If payment is online and gateway enabled, payment URL is returned and user is redirected.
8. Customer tracks order with public order-tracking endpoint.

### 7.7 Payment workflow

Cash/pay later:
1. Order is placed with `pending` payment status.
2. Staff/admin can mark order paid from dashboard.

Online payment:
1. Transaction is initiated (SSLCommerz).
2. Order stores gateway and transaction identifiers.
3. Success callback or IPN validates and updates payment as paid.
4. Customer is redirected back to tracking page with payment outcome.

### 7.8 Kitchen workflow

1. Kitchen page polls active order queue.
2. Kitchen sees status-prioritized cards and line items.
3. `advanceOrder` moves order to next status in state machine.
4. `OrderStatusUpdated` event broadcasts to dashboard and customer tracking listeners.

### 7.9 POS workflow

1. Staff/admin submits POS order (`dine`, `parcel`, or `quick`).
2. Tenant is derived from authenticated user (no public tenant parameter).
3. Order is created via `BillingService`, tagged `source = pos`.
4. Supports immediate paid status for counter/card/mobile banking flows.
5. New order broadcast updates downstream clients.

### 7.10 Order management workflow (dashboard)

1. Tenant users filter/search orders.
2. Status updates can be applied manually.
3. Completion or cancellation may release table if no other active order remains.
4. Cancellation restores voucher usage counter where applicable.
5. Public VAT-compliant invoice payload is available per order number.

### 7.11 Voucher workflow

1. Tenant creates voucher with type (percentage/fixed), min purchase, usage constraints, expiry.
2. Public validation endpoint checks tenant, voucher validity, threshold.
3. Billing applies discount and increments usage on successful order creation.
4. Cancellation/autocancel decrements usage as rollback.

### 7.12 Reporting workflow

Tenant reports include:
- Sales summary + daily breakdown
- Voucher impact
- Table performance
- Trends (daily/weekly/monthly)
- Top-selling items
- Revenue comparison
- Settlement report
- VAT daily and monthly reports

All reports are generated from persisted transactional records.

### 7.13 Settlement and commission workflow

1. Monthly job calculates settlement for platform-collection tenants.
2. Commission amount and payable balances are computed.
3. Super admin records settlement payments.
4. Settlement status transitions (`pending` -> `partial` -> `settled`) based on paid amount.

### 7.14 User and profile workflow

User management:
- Super admin: global user management
- Restaurant admin: tenant-scoped user management (primarily staff/kitchen)
- Tenant `max_users` limit enforced on creation

Profile management:
- Authenticated users can update own profile and password.

### 7.15 Branding workflow

Platform branding (super admin):
- Global name/logo/colors/footer/favicon
- Publicly consumed by SPA bootstrap

Tenant branding (restaurant admin):
- Tenant-specific logo/colors/banner/favicon/social links
- Used by customer pages and tenant contexts

### 7.16 Announcement workflow

1. Super admin drafts announcement.
2. Defines channel type (`in_app`, `email`, `both`) and recipient strategy.
3. Sends announcement; status changes to sent with timestamp.
4. Tenant users fetch active unread announcements and mark as read.

### 7.17 Contact enquiry workflow

1. Public contact form stores enquiry.
2. Super admin views, filters, marks read, updates status, replies by email, archives/deletes.
3. Actions are audit logged.

### 7.18 Audit logging workflow

Audit logging captures:
- CRUD actions
- Login/logout
- Profile/password updates
- Financial/admin actions
- Impersonation and other custom events

Super admin can filter, inspect stats, and export logs to CSV.

### 7.19 System operations workflow

System endpoints provide:
- Public and admin health checks
- Queue stats and failed-job retries
- Cache clearing by scope
- Tail of application logs
- Environment/runtime info snapshot

### 7.20 AI feature workflows

AI Analytics Assistant:
1. User asks question.
2. Intent classification selects tenant analytics data context.
3. Gemini response generated and persisted in conversation history.

AI Sales Forecast:
1. Historical order patterns are aggregated.
2. Statistical forecast generated.
3. AI/fallback insights provided for operations.

AI Recommendations:
1. Engine combines time-based, popularity, complementary, and AI-suggested candidates.
2. Deduplicated recommendation list returned.

Customer Chatbot:
1. Message intent is classified.
2. Menu/order/restaurant context assembled.
3. AI response generated; fallback used if AI unavailable.
4. Anonymous session conversation persisted.

AI Menu Description Generator:
1. Single/batch/improve/alternatives requests accepted.
2. AI output cleaned and optionally applied to menu item.
3. Template fallback used if AI unavailable.

AI Sentiment:
1. Feedback texts gathered from notes/chats.
2. Rule-based or AI analysis computes polarity and score.
3. Trends, themes, and negative feedback list are returned.

## 8. Event-driven architecture details

Event emitters:
- Order placement
- Order status changes
- Menu availability toggles
- Table transfers

Event consumers:
- Kitchen display
- Dashboard order screens
- Customer order tracking
- Customer live menu availability handling

## 9. Scheduled automation details

`AutoCancelStaleOrders`:
- Cancels old `placed` orders after configured threshold
- Releases table where applicable
- Rolls back voucher usage
- Broadcasts status update

`CheckSubscriptionExpiry`:
- Expires overdue subscriptions
- Deactivates tenant with no active subscription
- Deactivates tenants after trial expiry if unsubscribed
- Sends expiry mail

`SendSubscriptionExpiryWarnings`:
- Sends warning emails at 7/3/1-day windows

`CalculateSettlement`:
- Computes monthly sales, commission, and payable balances

## 10. Frontend route and UI workflow map

Public routes:
- `/` landing page
- `/login`, `/register`
- `/restaurant/:slug` menu
- `/restaurant/:slug/cart`
- `/order/:orderNumber` tracking/invoice

Authenticated routes:
- `/dashboard/*` tenant and super admin dashboards
- `/kitchen` kitchen display

Role redirects:
- Super admin -> admin dashboard
- Kitchen -> kitchen page
- Restaurant roles -> tenant dashboard

## 11. Deployment and runtime workflow

Current CI workflow:
- GitHub Action triggers on push to `deploy` branch
- Uses FTP deploy action to upload artifacts to target server

Production runtime expected:
- Laravel app serving API + SPA fallback
- Queue worker process managed by supervisor
- Scheduler triggered every minute via cron
- Optional Redis + Pusher integration

## 12. Testing architecture

Testing stack:
- Pest + PHPUnit
- Feature tests with database refresh
- Unit tests for VAT calculation and core services
- In-memory sqlite in testing environment

Covered test areas include:
- Auth/profile
- Billing service
- Invoice sequence generation
- Middleware behavior
- Tenant isolation
- Subscription renewal
- VAT reporting

## 13. End-to-end workflow examples

### 13.1 Customer dine-in journey

1. Scan table QR -> open restaurant menu.
2. Add items, optional voucher, choose payment method.
3. Place order -> kitchen and dashboard receive new-order event.
4. Kitchen advances statuses.
5. Customer tracking page updates until completion.
6. Customer views/downloads invoice.

### 13.2 Staff POS quick sale journey

1. Staff logs in and opens POS.
2. Creates quick order with immediate payment.
3. Order saved with `source=pos`, paid status.
4. Appears in order history and reports instantly.

### 13.3 Super admin control journey

1. Monitors platform dashboard (MRR/ARR/churn/tenants).
2. Manages plans, tenants, subscriptions.
3. Sends announcements and responds to enquiries.
4. Reviews audit logs and system health.
5. Records settlement payments and exports reports.

## 14. Implementation notes and constraints

- API supports both unversioned and v1 prefixed routes.
- Tenant data isolation relies on auth context and global scopes; all admin cross-tenant reads use explicit `withoutGlobalScopes()` where needed.
- Financial calculations are done server-side and persisted to order columns for report stability.
- AI features are guarded by provider configuration, feature toggles, caching, and rate limits.
- Public ordering can be WiFi-restricted per tenant configuration.


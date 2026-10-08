# TablePilot - Documentation

A multi-tenant SaaS platform for restaurant management with order tracking, subscription billing, and real-time kitchen display.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Installation](#installation)
4. [Authentication & Authorization](#authentication--authorization)
5. [Multi-Tenancy](#multi-tenancy)
6. [Subscription System](#subscription-system)
7. [API Reference](#api-reference)
8. [Database Schema](#database-schema)
9. [Frontend Structure](#frontend-structure)
10. [Configuration](#configuration)

---

## Overview

### Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Laravel 11 (PHP 8.2+) |
| Frontend | React 18 + Vite |
| Authentication | JWT (php-open-source-saver/jwt-auth) |
| Database | MySQL / PostgreSQL |
| Real-time | Laravel Broadcasting (Pusher/Reverb) |
| Styling | Tailwind CSS |
| State Management | Zustand |
| Data Fetching | TanStack Query (React Query) |

### Key Features

- **Multi-tenant architecture** — each restaurant is a separate tenant with isolated data
- **Role-based access control** — super_admin, restaurant_admin, staff, kitchen
- **Subscription management** — monthly/yearly plans with payment integration
- **Order management** — dine-in and parcel orders with status tracking
- **Kitchen display system** — real-time order queue for kitchen staff
- **QR code ordering** — customers scan table QR to place orders
- **Voucher system** — percentage/fixed discounts with usage limits
- **Reports & analytics** — sales, trends, top items, settlements
- **Platform branding** — customizable logos, colors, footer text

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────┐│
│  │  Login   │ │Dashboard │ │ Kitchen  │ │   Customer Menu      ││
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │ API
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Laravel Backend                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Middleware Stack                       │   │
│  │  ForceJsonResponse → auth:api → tenant → subscription    │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐     │
│  │  Controllers │ │   Models     │ │    Global Scopes     │     │
│  │  (API/)      │ │  (Eloquent)  │ │   (TenantScope)      │     │
│  └──────────────┘ └──────────────┘ └──────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Database                                  │
│   tenants │ users │ subscriptions │ orders │ menu_items │ ...   │
└─────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
backend/
├── app/
│   ├── Http/
│   │   ├── Controllers/
│   │   │   ├── Api/              # API controllers
│   │   │   └── Auth/             # Web auth (Breeze)
│   │   ├── Middleware/
│   │   │   ├── CheckRole.php
│   │   │   ├── EnsureActiveSubscription.php
│   │   │   ├── ForceJsonResponse.php
│   │   │   ├── IdentifyTenant.php
│   │   │   └── ValidateWifiIp.php
│   │   └── Requests/             # Form request validation
│   ├── Models/
│   │   ├── Scopes/
│   │   │   └── TenantScope.php   # Global tenant filtering
│   │   ├── Traits/
│   │   │   └── BelongsToTenant.php
│   │   └── *.php                 # Eloquent models
│   ├── Events/                   # Broadcasting events
│   ├── Jobs/                     # Queue jobs
│   └── Providers/
├── config/
│   ├── saas.php                  # SaaS configuration
│   └── jwt.php                   # JWT configuration
├── database/
│   ├── migrations/
│   └── seeders/
├── resources/
│   ├── js/                       # React frontend
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── services/
│   │   └── stores/
│   └── views/
├── routes/
│   └── api.php                   # API routes
└── public/
    └── build/                    # Compiled frontend
```

---

## Installation

### Requirements

- PHP 8.2+
- Composer
- Node.js 18+
- MySQL 8+ or PostgreSQL 14+

### Setup Steps

```bash
# 1. Clone repository
git clone <repository-url>
cd backend

# 2. Install PHP dependencies
composer install

# 3. Install Node dependencies
npm install

# 4. Configure environment
cp .env.example .env
php artisan key:generate
php artisan jwt:secret

# 5. Configure database in .env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=restaurant_saas
DB_USERNAME=root
DB_PASSWORD=

# 6. Run migrations with seed data
php artisan migrate:fresh --seed

# 7. Create storage symlink
php artisan storage:link

# 8. Build frontend
npm run build

# 9. Start development server
php artisan serve
```

### Default Credentials (from seeder)

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@platform.com | password |
| Restaurant Admin | admin@demo-restaurant.com | password |

---

## Authentication & Authorization

### JWT Authentication

All API requests (except public routes) require a Bearer token:

```
Authorization: Bearer <token>
```

#### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@platform.com",
  "password": "password"
}
```

Response:
```json
{
  "success": true,
  "access_token": "eyJ0eXAiOiJKV1Q...",
  "token_type": "bearer",
  "expires_in": 86400,
  "user": {
    "id": 1,
    "name": "Super Admin",
    "email": "admin@platform.com",
    "role": "super_admin",
    "tenant_id": null
  }
}
```

### Roles

| Role | Description | Tenant-bound |
|------|-------------|--------------|
| `super_admin` | Platform owner, manages all tenants | No |
| `restaurant_admin` | Restaurant owner, manages their restaurant | Yes |
| `staff` | Takes orders, manages tables | Yes |
| `kitchen` | Views and advances order status | Yes |

### Role Middleware

```php
// routes/api.php
Route::middleware('role:super_admin')->group(function () {
    // Super admin only routes
});

Route::middleware('role:restaurant_admin,staff')->group(function () {
    // Restaurant admin OR staff
});
```

### Registration

**Registration is disabled for public users.** Only super admins can create:
- Tenants (restaurants) via `POST /api/admin/tenants`
- Users via `POST /api/admin/users`

---

## Multi-Tenancy

### How It Works

1. **User belongs to Tenant** — each non-super-admin user has a `tenant_id`
2. **Global Scope** — `TenantScope` automatically filters queries by the authenticated user's `tenant_id`
3. **Super Admin bypass** — users with `role = super_admin` have no `tenant_id` and see all data

### TenantScope

```php
// app/Models/Scopes/TenantScope.php
class TenantScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        if (auth()->check() && auth()->user()->tenant_id) {
            $builder->where($model->getTable() . '.tenant_id', auth()->user()->tenant_id);
        }
    }
}
```

### Models with Tenant Isolation

These models use `BelongsToTenant` trait and are automatically scoped:

- `Category`
- `MenuItem`
- `Order`
- `RestaurantTable`
- `Settlement`
- `Subscription`
- `Voucher`

### Middleware Stack

```php
Route::middleware(['tenant', 'subscription'])->group(function () {
    // Tenant-scoped routes
});
```

| Middleware | Purpose |
|------------|---------|
| `tenant` | Verifies user has valid tenant; super_admin bypasses |
| `subscription` | Verifies tenant has active subscription |
| `role:X` | Verifies user has required role(s) |

---

## Subscription System

### Plans (config/saas.php)

```php
'plans' => [
    'monthly' => [
        'name' => 'Monthly',
        'price' => 999,
        'duration_days' => 30,
    ],
    'yearly' => [
        'name' => 'Yearly',
        'price' => 9999,
        'duration_days' => 365,
    ],
],
```

### Subscription Flow

1. **Super admin creates tenant** with initial subscription
2. **Subscription expiry** — `EnsureActiveSubscription` middleware blocks access (HTTP 402)
3. **Renewal** — super admin creates new subscription or tenant initiates payment

### Subscription States

| Status | Description |
|--------|-------------|
| `active` | Valid, not expired |
| `expired` | Past `expires_at` date |
| `cancelled` | Manually cancelled by admin |

### API Endpoints

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/admin/subscriptions` | super_admin | List all subscriptions |
| POST | `/api/admin/subscriptions` | super_admin | Create subscription |
| POST | `/api/admin/subscriptions/{id}/cancel` | super_admin | Cancel subscription |
| GET | `/api/subscription/current` | tenant user | Get own subscription status |

---

## API Reference

### Public Routes (No Auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Authenticate user |
| GET | `/api/platform/branding` | Get platform branding |
| GET | `/api/customer/restaurant/{slug}` | Get restaurant info |
| GET | `/api/customer/restaurant/{slug}/menu` | Get restaurant menu |
| GET | `/api/customer/restaurant/{slug}/table/{id}` | Get table info |
| POST | `/api/customer/restaurant/{slug}/order` | Place order |
| GET | `/api/customer/order/track/{orderNumber}` | Track order |
| POST | `/api/customer/voucher/validate` | Validate voucher |

### Authenticated Routes

| Method | Endpoint | Middleware | Description |
|--------|----------|------------|-------------|
| GET | `/api/auth/me` | auth | Get current user |
| POST | `/api/auth/logout` | auth | Logout |
| POST | `/api/auth/refresh` | auth | Refresh token |
| GET | `/api/dashboard` | auth | Dashboard stats |

### Tenant-Scoped Routes (auth + tenant + subscription)

#### Menu Items

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/menu-items` | any | List menu items |
| POST | `/api/menu-items` | any | Create menu item |
| GET | `/api/menu-items/{id}` | any | Get menu item |
| PUT | `/api/menu-items/{id}` | any | Update menu item |
| DELETE | `/api/menu-items/{id}` | any | Delete menu item |
| PATCH | `/api/menu-items/{id}/toggle` | any | Toggle availability |

#### Categories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/categories` | List categories |
| POST | `/api/categories` | Create category |
| PUT | `/api/categories/{id}` | Update category |
| DELETE | `/api/categories/{id}` | Delete category |

#### Tables

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tables` | List tables |
| POST | `/api/tables` | Create table |
| PUT | `/api/tables/{id}` | Update table |
| DELETE | `/api/tables/{id}` | Delete table |
| POST | `/api/tables/transfer` | Transfer order between tables |
| GET | `/api/tables/{id}/qr` | Generate QR code |

#### Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders` | List orders |
| GET | `/api/orders/{id}` | Get order details |
| PATCH | `/api/orders/{id}/status` | Update order status |
| POST | `/api/orders/{id}/cancel` | Cancel order |
| POST | `/api/orders/{id}/mark-paid` | Mark as paid |

#### Kitchen

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/kitchen/orders` | Active orders |
| GET | `/api/kitchen/orders/{status}` | Orders by status |
| POST | `/api/kitchen/orders/{id}/advance` | Advance order status |
| GET | `/api/kitchen/stats` | Kitchen statistics |

#### Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports/sales` | Sales report |
| GET | `/api/reports/vouchers` | Voucher usage report |
| GET | `/api/reports/tables` | Table performance |
| GET | `/api/reports/trends` | Order trends |
| GET | `/api/reports/top-items` | Top selling items |

#### Users (Read-only for restaurant_admin)

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/users` | restaurant_admin | List tenant users |
| GET | `/api/users/{id}` | restaurant_admin | Get user details |

#### Branding (restaurant_admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/branding` | Get restaurant branding |
| POST | `/api/branding` | Update branding |

### Super Admin Routes (/api/admin/*)

All require `role:super_admin` middleware.

#### Tenants

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/tenants` | List all tenants |
| POST | `/api/admin/tenants` | Create tenant (with admin user + subscription) |
| GET | `/api/admin/tenants/{id}` | Get tenant details |
| PUT | `/api/admin/tenants/{id}` | Update tenant |
| DELETE | `/api/admin/tenants/{id}` | Deactivate tenant |
| GET | `/api/admin/tenants-dashboard` | Platform dashboard |

#### Users (Full CRUD)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List all users |
| POST | `/api/admin/users` | Create user |
| GET | `/api/admin/users/{id}` | Get user |
| PUT | `/api/admin/users/{id}` | Update user |
| DELETE | `/api/admin/users/{id}` | Deactivate user |

#### Subscriptions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/subscriptions` | List all subscriptions |
| POST | `/api/admin/subscriptions` | Create subscription |
| GET | `/api/admin/subscriptions/{id}` | Get subscription |
| POST | `/api/admin/subscriptions/{id}/cancel` | Cancel subscription |

#### Settlements

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/all-settlements` | List all settlements |
| POST | `/api/admin/settlements/{id}/payment` | Record payment |

#### Platform Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/settings` | Get platform settings |
| POST | `/api/admin/settings` | Update settings |

---

## Database Schema

### Core Tables

#### tenants

| Column | Type | Description |
|--------|------|-------------|
| id | bigint | Primary key |
| name | string | Restaurant name |
| slug | string | URL-friendly identifier |
| email | string | Contact email |
| phone | string | Contact phone |
| address | text | Physical address |
| logo | string | Logo path |
| logo_dark | string | Dark mode logo |
| favicon | string | Favicon path |
| primary_color | string | Brand color |
| authorized_wifi_ip | string | Allowed IP for ordering |
| payment_mode | enum | 'platform' or 'seller' |
| commission_rate | decimal | Platform commission % |
| tax_rate | decimal | Tax % |
| is_active | boolean | Active status |

#### users

| Column | Type | Description |
|--------|------|-------------|
| id | bigint | Primary key |
| tenant_id | bigint | Foreign key (nullable for super_admin) |
| name | string | Full name |
| email | string | Unique email |
| password | string | Hashed password |
| role | enum | super_admin, restaurant_admin, staff, kitchen |
| status | enum | active, inactive |
| phone | string | Contact phone |

#### subscriptions

| Column | Type | Description |
|--------|------|-------------|
| id | bigint | Primary key |
| tenant_id | bigint | Foreign key |
| plan_type | enum | monthly, yearly, custom |
| amount | decimal | Payment amount |
| payment_method | string | bkash, sslcommerz, manual |
| payment_ref | string | Payment reference |
| starts_at | date | Start date |
| expires_at | date | Expiry date |
| status | enum | active, expired, cancelled |

#### categories

| Column | Type | Description |
|--------|------|-------------|
| id | bigint | Primary key |
| tenant_id | bigint | Foreign key |
| name | string | Category name |
| description | text | Description |
| sort_order | int | Display order |
| is_active | boolean | Active status |

#### menu_items

| Column | Type | Description |
|--------|------|-------------|
| id | bigint | Primary key |
| tenant_id | bigint | Foreign key |
| category_id | bigint | Foreign key |
| name | string | Item name |
| description | text | Description |
| price | decimal | Price |
| image | string | Image path |
| is_active | boolean | Availability |
| sort_order | int | Display order |
| deleted_at | timestamp | Soft delete |

#### restaurant_tables

| Column | Type | Description |
|--------|------|-------------|
| id | bigint | Primary key |
| tenant_id | bigint | Foreign key |
| table_number | string | Table identifier |
| qr_code | string | QR code data |
| status | enum | available, occupied, inactive |
| capacity | int | Seating capacity |

#### orders

| Column | Type | Description |
|--------|------|-------------|
| id | bigint | Primary key |
| tenant_id | bigint | Foreign key |
| table_id | bigint | Foreign key (nullable for parcel) |
| voucher_id | bigint | Foreign key (nullable) |
| order_number | string | Unique order number |
| customer_name | string | Customer name |
| customer_phone | string | Customer phone |
| subtotal | decimal | Subtotal |
| discount | decimal | Discount amount |
| tax | decimal | Tax amount |
| grand_total | decimal | Final total |
| type | enum | dine, parcel |
| status | enum | placed, confirmed, preparing, ready, served, completed, cancelled |
| payment_status | enum | pending, paid |
| notes | text | Special instructions |

#### order_items

| Column | Type | Description |
|--------|------|-------------|
| id | bigint | Primary key |
| order_id | bigint | Foreign key |
| menu_item_id | bigint | Foreign key |
| qty | int | Quantity |
| price_at_sale | decimal | Price when ordered |
| line_total | decimal | qty × price |
| special_instructions | text | Item notes |

#### vouchers

| Column | Type | Description |
|--------|------|-------------|
| id | bigint | Primary key |
| tenant_id | bigint | Foreign key |
| code | string | Voucher code |
| discount_value | decimal | Discount amount |
| type | enum | percentage, fixed |
| min_purchase | decimal | Minimum order |
| expiry_date | date | Expiry date |
| is_active | boolean | Active status |
| max_uses | int | Usage limit |
| used_count | int | Times used |

#### settlements

| Column | Type | Description |
|--------|------|-------------|
| id | bigint | Primary key |
| tenant_id | bigint | Foreign key |
| total_sold | decimal | Total sales |
| commission_rate | decimal | Commission % |
| commission_amount | decimal | Commission amount |
| total_paid | decimal | Amount paid |
| payable_balance | decimal | Remaining balance |
| period_start | date | Period start |
| period_end | date | Period end |
| status | enum | pending, partial, settled |

#### platform_settings

| Column | Type | Description |
|--------|------|-------------|
| id | bigint | Primary key |
| key | string | Setting key |
| value | text | Setting value |
| type | string | text, image, color |
| group | string | branding, general |

---

## Frontend Structure

### Pages

```
resources/js/pages/
├── auth/
│   ├── LoginPage.jsx
│   └── RegisterPage.jsx        # Disabled
├── admin/                       # Super admin only
│   ├── TenantsPage.jsx
│   ├── SubscriptionsPage.jsx
│   └── AdminSettingsPage.jsx
├── dashboard/                   # Restaurant admin/staff
│   ├── DashboardPage.jsx
│   ├── MenuItemsPage.jsx
│   ├── CategoriesPage.jsx
│   ├── OrdersPage.jsx
│   ├── TablesPage.jsx
│   ├── VouchersPage.jsx
│   ├── UsersPage.jsx
│   ├── ReportsPage.jsx
│   ├── SettlementsPage.jsx
│   └── SettingsPage.jsx
├── kitchen/
│   └── KitchenDisplayPage.jsx
└── customer/                    # Public
    ├── CustomerMenuPage.jsx
    ├── CustomerCartPage.jsx
    └── OrderTrackingPage.jsx
```

### State Management (Zustand)

```javascript
// stores/authStore.js
const useAuthStore = create((set) => ({
  user: null,
  token: null,
  login: (user, token) => set({ user, token }),
  logout: () => set({ user: null, token: null }),
}));

// stores/cartStore.js
const useCartStore = create((set) => ({
  items: [],
  addItem: (item) => { ... },
  removeItem: (id) => { ... },
  clear: () => set({ items: [] }),
}));

// stores/brandingStore.js
const useBrandingStore = create((set) => ({
  branding: {},
  setBranding: (data) => set({ branding: data }),
}));
```

### API Services

```javascript
// services/api.js
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// Auto-attach JWT token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const adminAPI = {
  tenants: {
    list: () => api.get('/admin/tenants'),
    create: (data) => api.post('/admin/tenants', data),
    // ...
  },
  // ...
};
```

---

## Configuration

### Environment Variables

```env
# Application
APP_NAME="TablePilot"
APP_ENV=production
APP_DEBUG=false
APP_URL=https://your-domain.com

# Database
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=restaurant_saas
DB_USERNAME=root
DB_PASSWORD=

# JWT
JWT_SECRET=your-jwt-secret
JWT_TTL=1440                    # Token lifetime in minutes (24 hours)

# Payment Gateways (optional)
BKASH_ENABLED=false
BKASH_APP_KEY=
BKASH_APP_SECRET=
BKASH_USERNAME=
BKASH_PASSWORD=
BKASH_SANDBOX=true

SSLCOMMERZ_ENABLED=false
SSLCOMMERZ_STORE_ID=
SSLCOMMERZ_STORE_PASSWORD=
SSLCOMMERZ_SANDBOX=true

# WiFi Enforcement
WIFI_ENFORCEMENT_ENABLED=true
```

### SaaS Configuration (config/saas.php)

```php
return [
    'plans' => [
        'monthly' => ['name' => 'Monthly', 'price' => 999, 'duration_days' => 30],
        'yearly' => ['name' => 'Yearly', 'price' => 9999, 'duration_days' => 365],
    ],
    'default_commission_rate' => 5.00,
    'wifi_enforcement' => env('WIFI_ENFORCEMENT_ENABLED', true),
    'order' => ['auto_cancel_minutes' => 30],
];
```

---

## Order Flow

### Status Progression

```
placed → confirmed → preparing → ready → served → completed
                                              ↓
                                          cancelled
```

### WiFi Validation

When `WIFI_ENFORCEMENT_ENABLED=true` and tenant has `authorized_wifi_ip` set:
- Customer orders are validated against their IP address
- Mismatch results in HTTP 403

### Order Number Format

```
ORD-YYYYMMDD-XXXX
```

Example: `ORD-20260212-0001`

---

## Events & Broadcasting

### Available Events

| Event | Description |
|-------|-------------|
| `NewOrderCreated` | New order placed |
| `OrderStatusUpdated` | Order status changed |
| `MenuItemAvailabilityChanged` | Item toggled on/off |
| `TableTransferred` | Order moved to different table |

### Usage

```javascript
// Frontend (Echo)
window.Echo.private(`tenant.${tenantId}`)
  .listen('NewOrderCreated', (e) => {
    // Refresh orders list
  });
```

---

## Jobs & Queues

| Job | Description |
|-----|-------------|
| `CheckSubscriptionExpiry` | Marks expired subscriptions |
| `CalculateSettlement` | Generates settlement records |
| `GenerateReport` | Background report generation |

### Running Queue Worker

```bash
php artisan queue:work
```

---

## Security Considerations

1. **JWT tokens** — stored in localStorage, auto-refreshed
2. **Password hashing** — bcrypt via Laravel's `hashed` cast
3. **Role middleware** — enforced at route level
4. **Tenant isolation** — automatic via global scope
5. **Input validation** — FormRequest classes for all mutations
6. **CORS** — configured in `config/cors.php`

---

## Deployment

### Production Checklist

```bash
# 1. Set environment
APP_ENV=production
APP_DEBUG=false

# 2. Optimize
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan optimize

# 3. Build frontend
npm run build

# 4. Set permissions
chmod -R 755 storage bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache
```

### Server Requirements

- PHP 8.2+ with extensions: BCMath, Ctype, Fileinfo, JSON, Mbstring, OpenSSL, PDO, Tokenizer, XML
- Nginx or Apache
- MySQL 8+ or PostgreSQL 14+
- Redis (optional, for caching/queues)
- Supervisor (for queue workers)

---

## Troubleshooting

## Subscription Module Redesign (2026-04)

### Access States

- `active`: subscription valid
- `trial`: trial subscription active (`is_trial = true`)
- `grace`: subscription expired but still within grace window (`grace_ends_at`)
- `expired`: subscription and grace are both ended
- `none`: no subscription exists

`EnsureActiveSubscription` now relies on `SubscriptionService::getAccessStatus()` and sets `X-Subscription-Warning: grace_period` while in grace state.

### New/Updated API Endpoints

- `GET /api/subscription/current`
- `GET /api/subscription/plans`
- `POST /api/subscription/initiate`
- `POST /api/subscription/verify`
- `PATCH /api/admin/plans/{id}/toggle`
- `POST /api/payment/sslcommerz/callback`
- `POST /api/payment/sslcommerz/ipn` (also handles subscription transaction IDs)
- `POST /api/payment/bkash/callback`

All routes are also mounted under `/api/v1/*`.

### Database Changes

- `subscriptions` now includes `is_trial`, `grace_ends_at`, `initiated_by`
- `status` includes `grace`
- `plan_type` remains for backward compatibility
- `subscription_plans` now supports soft delete (`deleted_at`)
- Backfill migration maps `plan_type -> plan_id` and creates trial subscriptions from `tenants.trial_ends_at`

### Source of Truth

`subscription_plans` table is the source of truth for plans. `config/saas.php` hardcoded plan entries are retained only as legacy fallback.

### Common Issues

| Issue | Solution |
|-------|----------|
| 401 Unauthorized | Token expired — call `/api/auth/refresh` |
| 402 Payment Required | Subscription expired — renew via admin |
| 403 Forbidden | Role/tenant mismatch — check user permissions |
| 500 Server Error | Check `storage/logs/laravel.log` |

### Useful Commands

```bash
# Clear all caches
php artisan optimize:clear

# Reload routes
php artisan route:clear && php artisan route:cache

# Check database connection
php artisan tinker --execute="DB::connection()->getPdo()"

# Verify JWT secret
php artisan tinker --execute="config('jwt.secret')"
```

---

## License

Proprietary. All rights reserved.

---

*Documentation generated: February 12, 2026*

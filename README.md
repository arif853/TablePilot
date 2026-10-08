# 🍽️ TablePilot — The AI-Powered Restaurant Platform

A full-featured, multi-tenant **Restaurant Management SaaS Platform** built with **Laravel 12** and **React 18**. Designed for restaurant owners to manage menus, orders, tables, vouchers, kitchen displays, settlements, and more — all behind a subscription-based model managed by a super admin.

Current stable release: **v1.0.0**

Customers scan a **QR code** at their table, browse the menu, place orders, and pay — all from their phone. Staff and kitchen see orders in real-time via **Pusher** broadcasting.

---

## ✨ Features

### 🔐 Authentication & Roles
- JWT-based authentication (`php-open-source-saver/jwt-auth`)
- Role-based access control: **Super Admin**, **Restaurant Admin**, **Staff**, **Kitchen**
- Protected routes with middleware-enforced permissions

### 🏢 Multi-Tenancy
- Full tenant isolation with automatic query scoping (`BelongsToTenant` trait + `TenantScope`)
- Each restaurant (tenant) operates independently with its own data
- Tenant identification via middleware

### 📋 Menu Management
- CRUD for categories and menu items with image uploads
- Toggle item availability in real-time (broadcasted to customers)
- Soft delete with restore capability

### 🪑 Table & QR Code Management
- Create and manage restaurant tables
- Generate QR codes per table — customers scan to access the digital menu
- Parcel/takeaway QR code support
- Table transfer functionality between staff

### 🛒 Customer Ordering (Public, No Auth)
- Customers scan QR → browse menu → add to cart → place order
- WiFi IP validation middleware (optional — ensures orders come from restaurant network)
- Voucher/discount code support at checkout
- **Payment options**: Cash at counter or Online payment
- Real-time order tracking with live status updates

### 💳 Payment System
- **Offline**: Pay at counter (cash) — staff marks as paid from dashboard
- **Online**: Framework for SSLCommerz, bKash, ShurjoPay gateway integration
- Payment status tracking: `pending`, `paid`, `failed`, `refunded`
- **POS Invoice**: Thermal-printer-style (80mm) invoice generation
  - Customers can view & download from order tracking page
  - Staff can view & print from the dashboard

### 🍳 Kitchen Display System (KDS)
- Real-time kitchen order queue with sound notifications
- Filter orders by status
- One-click order advancement through workflow stages
- Kitchen performance stats

### 📊 Reports & Analytics
- Sales reports with date range filtering
- Top-selling items analysis
- Table performance metrics
- Revenue comparison & trend reports
- Voucher usage reports
- Settlement reports

### 💰 Settlements & Commission
- Automatic monthly settlement calculation (scheduled job)
- Configurable commission rate (default 5%)
- Super admin can record settlement payments
- Full settlement history per tenant

### 📱 Subscription Management
- Starter: ৳999/month or ৳9,990/year
- Professional: ৳2,499/month or ৳24,990/year
- Enterprise: ৳5,999/month or ৳59,990/year
- Subscription gating middleware — blocks tenant access when expired
- Super admin subscription management (create, view, cancel)
- Auto-expiry checking (daily scheduled job)

### 🎨 Branding & Customization
- **Platform-level**: Super admin sets platform name, logo, favicon, colors
- **Restaurant-level**: Each tenant customizes their own logo, favicon, colors, footer text
- Dynamic favicon/title updates per context (dashboard vs customer view)

### ⚡ Real-Time Broadcasting
- Pusher-powered WebSocket events
- `NewOrderCreated` — notifies kitchen & dashboard
- `OrderStatusUpdated` — updates customer tracking page
- `MenuItemAvailabilityChanged` — live menu updates for customers
- `TableTransferred` — staff notifications

### 📱 Progressive Web App (PWA)
- Installable on mobile devices
- Auto-update service worker strategy
- Offline-capable shell

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Laravel 12, PHP 8.2+ |
| **Frontend** | React 18, Vite 5, TailwindCSS 3 |
| **State Management** | Zustand |
| **Data Fetching** | TanStack React Query |
| **Authentication** | JWT (`php-open-source-saver/jwt-auth`) |
| **Real-Time** | Laravel Echo + Pusher |
| **Database** | MySQL 8.0+ |
| **PWA** | vite-plugin-pwa |
| **Icons** | react-icons |
| **QR Codes** | react-qr-code |
| **CSS Framework** | TailwindCSS + @tailwindcss/forms |

---

## 📁 Project Structure

```
├── app/
│   ├── Events/                    # Broadcast events (NewOrder, StatusUpdate, etc.)
│   ├── Http/
│   │   ├── Controllers/Api/       # 17 API controllers
│   │   ├── Middleware/            # Role, Tenant, Subscription, WiFi, JSON
│   │   └── Requests/             # Form request validation classes
│   ├── Jobs/                     # Settlement calculation, subscription checks
│   ├── Models/                   # 12 Eloquent models with tenant scoping
│   └── Scopes/                   # TenantScope for automatic query filtering
├── config/
│   ├── jwt.php                   # JWT authentication config
│   └── saas.php                  # Plans, commission, payment gateways, WiFi
├── database/
│   ├── migrations/               # 16 migration files
│   └── seeders/                  # Database, Tenant, User seeders
├── resources/js/
│   ├── components/               # Reusable UI components (Modal, POSInvoice, etc.)
│   ├── layouts/                  # DashboardLayout, CustomerLayout
│   ├── pages/
│   │   ├── admin/                # Super admin pages (Tenants, Subscriptions, Settings)
│   │   ├── auth/                 # Login, Register
│   │   ├── customer/             # Menu browsing, Cart, Order tracking
│   │   ├── dashboard/            # Restaurant management pages
│   │   └── kitchen/              # Kitchen display system
│   ├── services/api.js           # Axios API service with JWT interceptors
│   └── stores/                   # Zustand stores (auth, branding, cart)
├── routes/
│   ├── api.php                   # All API routes (public, auth, tenant, admin)
│   ├── channels.php              # Broadcast channel authorization
│   └── console.php               # Scheduled tasks
└── public/
    └── assets/                   # Static assets (images, fonts, CSS, JS)
```

---

## 🚀 Getting Started

### Prerequisites

- PHP 8.2+
- Composer 2.x
- Node.js 18+ & npm
- MySQL 8.0+
- (Optional) Redis for caching
- (Optional) Pusher account for real-time features

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/restaurant-saas.git
cd restaurant-saas

# Quick setup (install deps, copy .env, generate key, migrate, build)
composer run setup
```

Or manually:

```bash
# Install PHP dependencies
composer install

# Install Node dependencies
npm install

# Configure environment
cp .env.example .env
php artisan key:generate
php artisan jwt:secret
```

### Environment Configuration

Edit `.env` with your settings:

```env
APP_NAME="TablePilot"
APP_URL=http://localhost:8000

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=restaurant_saas
DB_USERNAME=root
DB_PASSWORD=your_password

# JWT
JWT_SECRET=  # Generated by php artisan jwt:secret

# Pusher (for real-time features)
BROADCAST_CONNECTION=pusher
PUSHER_APP_ID=your_app_id
PUSHER_APP_KEY=your_app_key
PUSHER_APP_SECRET=your_app_secret
PUSHER_APP_CLUSTER=ap1

# Payment Gateways (optional)
BKASH_ENABLED=false
SSLCOMMERZ_ENABLED=false
```

### Database Setup

```bash
php artisan migrate
php artisan db:seed          # Seeds default tenant + admin user
php artisan storage:link     # Link storage for file uploads
```

### Running the Application

```bash
# Development (runs Laravel server + queue + Vite concurrently)
composer run dev

# Or run separately:
php artisan serve            # Backend at http://localhost:8000
npm run dev                  # Frontend dev server at http://localhost:5173
php artisan queue:listen     # Process background jobs
```

### Building for Production

```bash
npm run build
```

---

## 🔌 API Overview

All API endpoints are prefixed with `/api`.

| Group | Prefix | Auth | Description |
|-------|--------|------|-------------|
| **Auth** | `/auth` | No | Login, Register |
| **Auth** | `/auth` | Yes | Me, Logout, Refresh |
| **Platform** | `/platform` | No | Public branding |
| **Customer** | `/customer` | No | Restaurant info, menu, ordering, tracking |
| **Dashboard** | `/dashboard` | Yes | Dashboard stats |
| **Menu Items** | `/menu-items` | Yes + Tenant | CRUD + toggle availability |
| **Categories** | `/categories` | Yes + Tenant | CRUD |
| **Tables** | `/tables` | Yes + Tenant | CRUD + QR generation |
| **Orders** | `/orders` | Yes + Tenant | List, status updates, cancel, mark paid |
| **Vouchers** | `/vouchers` | Yes + Tenant | CRUD |
| **Kitchen** | `/kitchen` | Yes + Tenant | Active orders, advance status |
| **Reports** | `/reports` | Yes + Tenant | Sales, trends, top items |
| **Settlements** | `/settlements` | Yes + Tenant | View settlements |
| **Users** | `/users` | Yes + Admin | Staff management |
| **Branding** | `/branding` | Yes + Admin | Restaurant branding |
| **Subscription** | `/subscription` | Yes + Tenant | Current plan, payments |
| **Admin** | `/admin` | Super Admin | Tenants, subscriptions, settings |

---

## 🔄 Order Workflow

```
placed → confirmed → preparing → ready → served → completed
                                                  ↘ cancelled
```

Orders flow through these stages with real-time broadcasting at each step. Kitchen staff advance orders through the KDS interface, and customers see live updates on their tracking page.

---

## 📱 Customer Flow

1. **Scan QR Code** at restaurant table
2. **Browse Menu** with categories, images, and prices
3. **Add to Cart** with quantity selection
4. **Apply Voucher** (optional discount code)
5. **Choose Payment** — Cash at counter or Online
6. **Place Order** — validated against WiFi network (optional)
7. **Track Order** — real-time status updates via WebSocket
8. **View Invoice** — POS-style receipt, downloadable/printable

---

## 🗓️ Scheduled Tasks

| Task | Schedule | Description |
|------|----------|-------------|
| `CheckSubscriptionExpiry` | Daily at 00:05 | Marks expired subscriptions |
| `CalculateSettlement` | 1st of month at 02:00 | Calculates monthly settlements |
| `cache:prune-stale-tags` | Hourly | Cleans up stale cache |

---

## 🧪 Testing

```bash
# Run all tests
composer test

# Or directly
php artisan test

# With coverage
php artisan test --coverage
```

Tests use **Pest PHP** framework with Laravel plugin.

---

## 🌐 Deployment

The application supports deployment on:

- **VPS/Dedicated Servers** — Ubuntu 22.04+, Nginx, Supervisor
- **cPanel Shared Hosting** — with utility routes for cache clearing, migrations, and storage linking

Key deployment routes (for cPanel environments):

```
GET /api/clear-cache       # Clear all caches
GET /api/optimize:clear    # Clear optimization cache
GET /api/storage-link      # Create storage symlink (with copy fallback)
GET /api/migrate           # Run pending migrations
```

---

## 📄 License

This project is open-sourced under the [MIT License](LICENSE).

---

## 👤 Author

Built with ❤️ using Laravel & React.

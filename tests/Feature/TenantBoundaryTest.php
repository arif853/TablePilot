<?php

use App\Models\Category;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\RestaurantTable;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\User;
use App\Services\AI\CustomerChatbotService;
use App\Services\BillingService;
use App\Services\InvoiceNumberService;
use App\Services\VatCalculationService;

beforeEach(function () {
    $this->tenantA = Tenant::factory()->create();
    $this->tenantB = Tenant::factory()->create();
    Subscription::factory()->create(['tenant_id' => $this->tenantA->id]);
    Subscription::factory()->create(['tenant_id' => $this->tenantB->id]);

    $this->adminA = User::factory()->restaurantAdmin()->create(['tenant_id' => $this->tenantA->id]);
    $this->headersA = ['Authorization' => 'Bearer ' . auth('api')->login($this->adminA)];
});

// ─── Foreign keys must belong to the caller's tenant ────────────────
test('a menu item cannot be placed in another tenants category', function () {
    $mine = Category::factory()->create(['tenant_id' => $this->tenantA->id]);
    $theirs = Category::factory()->create(['tenant_id' => $this->tenantB->id]);

    $this->withHeaders($this->headersA)
        ->postJson('/api/menu-items', ['name' => 'Injected', 'price' => 10, 'category_id' => $theirs->id])
        ->assertStatus(422)
        ->assertJsonValidationErrors('category_id');

    $this->withHeaders($this->headersA)
        ->postJson('/api/menu-items', ['name' => 'Legit', 'price' => 10, 'category_id' => $mine->id])
        ->assertCreated();

    expect(MenuItem::withoutGlobalScopes()->where('category_id', $theirs->id)->count())->toBe(0);
});

test('a menu item cannot be moved into another tenants category', function () {
    $item = MenuItem::factory()->create([
        'tenant_id' => $this->tenantA->id,
        'category_id' => Category::factory()->create(['tenant_id' => $this->tenantA->id])->id,
    ]);
    $theirs = Category::factory()->create(['tenant_id' => $this->tenantB->id]);

    $this->withHeaders($this->headersA)
        ->putJson("/api/menu-items/{$item->id}", ['name' => 'Moved', 'price' => 10, 'category_id' => $theirs->id])
        ->assertStatus(422);
});

test('tables of another tenant cannot be used in a transfer', function () {
    $mine = RestaurantTable::factory()->create(['tenant_id' => $this->tenantA->id]);
    $theirs = RestaurantTable::factory()->create(['tenant_id' => $this->tenantB->id]);

    $this->withHeaders($this->headersA)
        ->postJson('/api/tables/transfer', ['from_table_id' => $mine->id, 'to_table_id' => $theirs->id])
        ->assertStatus(422)
        ->assertJsonValidationErrors('to_table_id');
});

// ─── Scope fails closed ─────────────────────────────────────────────
test('an authenticated user without a tenant sees no tenant data', function () {
    Category::factory()->create(['tenant_id' => $this->tenantA->id]);
    Category::factory()->create(['tenant_id' => $this->tenantB->id]);

    $orphan = User::factory()->create(['role' => 'staff', 'tenant_id' => null]);
    auth('api')->login($orphan);

    expect(Category::count())->toBe(0);
});

test('a super admin still sees every tenant', function () {
    Category::factory()->create(['tenant_id' => $this->tenantA->id]);
    Category::factory()->create(['tenant_id' => $this->tenantB->id]);

    auth('api')->login(User::factory()->superAdmin()->create());

    expect(Category::count())->toBe(2);
});

// ─── Public chatbot order lookup ────────────────────────────────────
function chatbotFor(Tenant $tenant): CustomerChatbotService
{
    return app(CustomerChatbotService::class)->forTenant($tenant->id);
}

function callProtected(object $obj, string $method, mixed ...$args): mixed
{
    $m = new ReflectionMethod($obj, $method);
    $m->setAccessible(true);

    return $m->invoke($obj, ...$args);
}

test('chatbot only recognises full order numbers', function () {
    $bot = chatbotFor($this->tenantA);

    expect(callProtected($bot, 'extractOrderNumber', 'where is ORD-20261008-12-0003 please'))->toBe('ORD-20261008-12-0003')
        ->and(callProtected($bot, 'extractOrderNumber', 'order 20261008'))->toBeNull()
        ->and(callProtected($bot, 'extractOrderNumber', 'order #1'))->toBeNull();
});

test('chatbot shares status only and never leaks another tenants order', function () {
    $category = Category::factory()->create(['tenant_id' => $this->tenantB->id]);
    $item = MenuItem::factory()->create(['tenant_id' => $this->tenantB->id, 'category_id' => $category->id, 'price' => 100, 'is_active' => true]);
    $order = (new BillingService(new VatCalculationService, new InvoiceNumberService))->createOrder($this->tenantB, [
        'type' => 'parcel',
        'items' => [['menu_item_id' => $item->id, 'qty' => 2]],
    ]);

    // Tenant B's own customers get the status, but no items or totals
    $own = callProtected(chatbotFor($this->tenantB), 'getOrderStatus', $order->order_number);
    expect($own)->toContain($order->order_number)
        ->and($own)->toContain('Status:')
        ->and($own)->not->toContain('Total')
        ->and($own)->not->toContain($item->name);

    // Tenant A's chat can't see tenant B's order, nor guess it by partial number or id
    expect(callProtected(chatbotFor($this->tenantA), 'getOrderStatus', $order->order_number))->toContain('not found')
        ->and(callProtected(chatbotFor($this->tenantB), 'getOrderStatus', substr($order->order_number, 4, 8)))->toContain('not found')
        ->and(callProtected(chatbotFor($this->tenantB), 'getOrderStatus', (string) $order->id))->toContain('not found');
});

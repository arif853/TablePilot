<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\BaseApiController;
use App\Http\Requests\StoreUserRequest;
use App\Models\Tenant;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UserController extends BaseApiController
{
    /**
     * List users.
     * - Super admin: can list all users, optionally filter by tenant_id
     * - Restaurant admin: can only see own tenant's users (read-only)
     */
    public function index(Request $request): JsonResponse
    {
        $authUser = auth()->user();
        $query = User::query()->with('tenant:id,name,slug');

        if ($authUser->isSuperAdmin()) {
            // Super admin can filter by tenant_id
            if ($tenantId = $request->get('tenant_id')) {
                $query->where('tenant_id', $tenantId);
            }
        } else {
            // Non-super-admin can only see their own tenant's users
            $query->where('tenant_id', $authUser->tenant_id);
        }

        if ($role = $request->get('role')) {
            $query->where('role', $role);
        }

        if ($status = $request->get('status')) {
            $query->where('status', $status);
        }

        if ($search = $request->get('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $perPage = min(max((int) $request->get('per_page', 15), 1), 100);
        $response = $this->paginated($query->latest(), $perPage);

        // Seat usage for the tenant being viewed, so the UI can show "3 of 5 users"
        $seatTenantId = $authUser->isSuperAdmin() ? $request->get('tenant_id') : $authUser->tenant_id;

        if ($seatTenantId && ($tenant = Tenant::find($seatTenantId))) {
            $payload = $response->getData(true);
            $payload['seats'] = [
                'used' => User::where('tenant_id', $tenant->id)->where('status', 'active')->count(),
                'max' => $tenant->max_users,
            ];
            $response->setData($payload);
        }

        return $response;
    }

    /**
     * Create user.
     * - Super admin: must provide tenant_id, can create any role
     * - Restaurant admin: auto-assigns own tenant_id, can create staff/kitchen only
     * Enforces max_users limit set by super admin on the tenant.
     */
    public function store(StoreUserRequest $request): JsonResponse
    {
        $authUser = auth()->user();
        $data = $request->validated();

        // Auto-assign tenant_id for restaurant admin
        if ($authUser->isRestaurantAdmin()) {
            $data['tenant_id'] = $authUser->tenant_id;
        }

        // Enforce user limit
        $tenant = Tenant::find($data['tenant_id']);

        if (!$tenant) {
            return $this->error('Tenant not found', 404);
        }

        $currentUserCount = User::where('tenant_id', $tenant->id)
            ->where('status', 'active')
            ->count();

        if ($currentUserCount >= $tenant->max_users) {
            return $this->error(
                "User limit reached. This restaurant can have a maximum of {$tenant->max_users} users. Contact the platform admin to increase the limit.",
                422
            );
        }

        $user = User::create($data);

        AuditLogger::logCreated($user);

        return $this->created($user->load('tenant:id,name'), 'User created');
    }

    /**
     * Show a user.
     * - Super admin: any user
     * - Restaurant admin: only own tenant's users
     */
    public function show(int $id): JsonResponse
    {
        $user = $this->resolveUser($id);

        if (!$user) {
            return $this->notFound('User not found');
        }

        return $this->success($user->load('tenant:id,name'));
    }

    /**
     * Update user.
     * - Super admin: can update any user
     * - Restaurant admin: can update own tenant's staff/kitchen users only
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $authUser = auth()->user();
        $user = $this->resolveUser($id);

        if (!$user) {
            return $this->notFound('User not found');
        }

        // Restaurant admin cannot update other restaurant admins or super admins
        if ($authUser->isRestaurantAdmin()) {
            if ($user->isSuperAdmin() || ($user->isRestaurantAdmin() && $user->id !== $authUser->id)) {
                return $this->forbidden('You can only update your own profile or staff/kitchen users');
            }

            $validated = $request->validate([
                'name' => 'sometimes|string|max:255',
                'email' => "sometimes|email|unique:users,email,{$id}",
                'password' => 'sometimes|string|min:8',
                // Restaurant admins manage staff/kitchen roles; their own role can only be re-sent unchanged
                'role' => ['sometimes', Rule::in($user->isRestaurantAdmin() ? [User::ROLE_RESTAURANT_ADMIN] : [User::ROLE_STAFF, User::ROLE_KITCHEN])],
                'phone' => 'nullable|string|max:20',
                'status' => 'sometimes|in:active,inactive',
            ]);
        } else {
            $validated = $request->validate([
                'name' => 'sometimes|string|max:255',
                'email' => "sometimes|email|unique:users,email,{$id}",
                'password' => 'sometimes|string|min:8',
                'role' => 'sometimes|in:restaurant_admin,staff,kitchen',
                'phone' => 'nullable|string|max:20',
                'status' => 'sometimes|in:active,inactive',
                'tenant_id' => 'sometimes|exists:tenants,id',
            ]);
        }

        if ($user->isSuperAdmin() && array_intersect_key($validated, array_flip(['role', 'tenant_id', 'status']))) {
            return $this->error('Role, tenant and status of a super admin cannot be changed', 422);
        }

        $changesAccess = ($validated['role'] ?? $user->role) !== $user->role
            || ($validated['status'] ?? $user->status) !== $user->status
            || (int) ($validated['tenant_id'] ?? $user->tenant_id) !== (int) $user->tenant_id;

        if ($changesAccess && $user->id === $authUser->id) {
            return $this->error('You cannot change your own role, status or restaurant', 422);
        }

        if ($changesAccess && $this->isLastActiveRestaurantAdmin($user)) {
            return $this->error('This is the restaurant\'s only active admin. Add or promote another admin first.', 422);
        }

        // Reactivating a user, or moving an active user to another tenant, takes a seat on that tenant
        $targetTenantId = $validated['tenant_id'] ?? $user->tenant_id;
        $becomesActive = ($validated['status'] ?? $user->status) === 'active';
        $takesNewSeat = $becomesActive && ($user->status !== 'active' || (int) $targetTenantId !== (int) $user->tenant_id);

        if ($takesNewSeat && $targetTenantId && ($tenant = Tenant::find($targetTenantId))) {
            $activeCount = User::where('tenant_id', $tenant->id)->where('status', 'active')->count();

            if ($activeCount >= $tenant->max_users) {
                return $this->error(
                    "User limit reached. {$tenant->name} can have a maximum of {$tenant->max_users} active users.",
                    422
                );
            }
        }

        $original = $user->toArray();
        $user->update($validated);

        AuditLogger::logUpdated($user, $original);

        return $this->success($user->fresh()->load('tenant:id,name'), 'User updated');
    }

    /**
     * Deactivate user.
     * - Super admin: can deactivate any non-super-admin user
     * - Restaurant admin: can deactivate own tenant's staff/kitchen users
     */
    public function destroy(int $id): JsonResponse
    {
        $authUser = auth()->user();
        $user = $this->resolveUser($id);

        if (!$user) {
            return $this->notFound('User not found');
        }

        if ($user->id === auth()->id()) {
            return $this->error('Cannot delete yourself', 422);
        }

        if ($user->isSuperAdmin()) {
            return $this->error('Cannot deactivate a super admin', 422);
        }

        // Restaurant admin cannot deactivate other restaurant admins
        if ($authUser->isRestaurantAdmin() && $user->isRestaurantAdmin()) {
            return $this->error('Cannot deactivate another admin', 422);
        }

        if ($this->isLastActiveRestaurantAdmin($user)) {
            return $this->error('This is the restaurant\'s only active admin. Add or promote another admin first.', 422);
        }

        $user->update(['status' => 'inactive']);

        AuditLogger::logAction('user_deactivated', $user);

        return $this->success(null, 'User deactivated');
    }

    /**
     * A tenant must always keep at least one active restaurant admin, or nobody can manage it.
     */
    private function isLastActiveRestaurantAdmin(User $user): bool
    {
        if (!$user->isRestaurantAdmin() || !$user->isActive() || !$user->tenant_id) {
            return false;
        }

        return !User::where('tenant_id', $user->tenant_id)
            ->where('role', User::ROLE_RESTAURANT_ADMIN)
            ->where('status', 'active')
            ->where('id', '!=', $user->id)
            ->exists();
    }

    /**
     * Resolve user based on role:
     * - Super admin sees any user
     * - Restaurant admin sees only own tenant's users
     */
    private function resolveUser(int $id): ?User
    {
        $authUser = auth()->user();

        if ($authUser->isSuperAdmin()) {
            return User::find($id);
        }

        return User::where('tenant_id', $authUser->tenant_id)->find($id);
    }
}

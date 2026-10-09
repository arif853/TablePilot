<?php

namespace App\Http\Controllers\Api;

use App\Events\MenuItemAvailabilityChanged;
use App\Http\Controllers\Api\BaseApiController;
use App\Http\Requests\StoreMenuItemRequest;
use App\Http\Requests\UpdateMenuItemRequest;
use App\Models\MenuItem;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class MenuItemController extends BaseApiController
{
    public function index(Request $request): JsonResponse
    {
        $query = MenuItem::with('category')->ordered();

        if ($request->has('category_id')) {
            $query->where('category_id', $request->category_id);
        }

        if ($request->boolean('active_only')) {
            $query->active();
        }

        if ($search = $request->get('search')) {
            $query->where('name', 'like', "%{$search}%");
        }

        return $this->paginated($query, $request->get('per_page', 50));
    }

    public function store(StoreMenuItemRequest $request): JsonResponse
    {
        $data = $request->validated();

        if ($request->hasFile('image')) {
            $data['image'] = $request->file('image')->store('menu-items', 'public');
        }

        $menuItem = MenuItem::create($data);

        AuditLogger::logCreated($menuItem);

        return $this->created($menuItem->load('category'), 'Menu item created');
    }

    public function show(int $id): JsonResponse
    {
        $menuItem = MenuItem::with('category')->find($id);

        if (!$menuItem) {
            return $this->notFound('Menu item not found');
        }

        return $this->success($menuItem);
    }

    public function update(UpdateMenuItemRequest $request, int $id): JsonResponse
    {
        $menuItem = MenuItem::find($id);

        if (!$menuItem) {
            return $this->notFound('Menu item not found');
        }

        $data = $request->validated();
        $original = $menuItem->toArray();

        if ($request->hasFile('image')) {
            // Delete old image when replacing
            if ($menuItem->image) {
                Storage::disk('public')->delete($menuItem->image);
            }
            $data['image'] = $request->file('image')->store('menu-items', 'public');
        }

        $oldActive = $menuItem->is_active;
        $menuItem->update($data);

        AuditLogger::logUpdated($menuItem, $original);

        // Broadcast availability change
        if (isset($data['is_active']) && $oldActive !== $data['is_active']) {
            broadcast(new MenuItemAvailabilityChanged($menuItem))->toOthers();
        }

        return $this->success($menuItem->fresh()->load('category'), 'Menu item updated');
    }

    public function destroy(int $id): JsonResponse
    {
        $menuItem = MenuItem::find($id);

        if (!$menuItem) {
            return $this->notFound('Menu item not found');
        }

        AuditLogger::logDeleted($menuItem);

        $menuItem->delete(); // Soft delete

        return $this->success(null, 'Menu item deleted');
    }

    public function toggleAvailability(int $id): JsonResponse
    {
        $menuItem = MenuItem::find($id);

        if (!$menuItem) {
            return $this->notFound('Menu item not found');
        }

        $original = $menuItem->toArray();
        $menuItem->toggleAvailability();

        AuditLogger::logUpdated($menuItem->fresh(), $original);

        broadcast(new MenuItemAvailabilityChanged($menuItem->fresh()))->toOthers();

        return $this->success($menuItem->fresh(), 'Availability toggled');
    }

    public function restore(int $id): JsonResponse
    {
        $menuItem = MenuItem::onlyTrashed()->find($id);

        if (!$menuItem) {
            return $this->notFound('Menu item not found');
        }

        $menuItem->restore();

        AuditLogger::logAction('restored', $menuItem);

        return $this->success($menuItem, 'Menu item restored');
    }
}

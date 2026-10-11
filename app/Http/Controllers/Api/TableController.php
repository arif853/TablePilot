<?php

namespace App\Http\Controllers\Api;

use App\Events\TableTransferred;
use App\Http\Controllers\Api\BaseApiController;
use App\Http\Requests\StoreTableRequest;
use App\Http\Requests\TransferTableRequest;
use App\Models\Order;
use App\Models\RestaurantTable;
use App\Models\Tenant;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class TableController extends BaseApiController
{
    public function index(Request $request): JsonResponse
    {
        // Running bill and seated-since time drive the floor plan without a request per table
        $query = RestaurantTable::withCount('activeOrders')
            ->withSum('activeOrders', 'grand_total')
            ->withMin('activeOrders', 'created_at');

        if ($status = $request->get('status')) {
            $query->where('status', $status);
        }

        return $this->success($query->orderBy('table_number')->get());
    }

    public function store(StoreTableRequest $request): JsonResponse
    {
        $tenantId = auth()->user()->tenant_id;

        // Check unique table number within tenant
        $exists = RestaurantTable::where('tenant_id', $tenantId)
            ->where('table_number', $request->table_number)
            ->exists();

        if ($exists) {
            return $this->error('Table number already exists', 422);
        }

        $table = RestaurantTable::create([
            'table_number' => $request->table_number,
            'capacity' => $request->capacity ?? 4,
            'status' => $request->status ?? 'available',
            'area' => $request->area ?: 'Main',
            'qr_code' => $this->generateQrIdentifier($tenantId, $request->table_number),
        ]);

        AuditLogger::logCreated($table);

        return $this->created($table, 'Table created');
    }

    public function show(int $id): JsonResponse
    {
        $table = RestaurantTable::with(['activeOrders.items.menuItem', 'activeOrders.servedBy:id,name'])->find($id);

        if (!$table) {
            return $this->notFound('Table not found');
        }

        return $this->success($table);
    }

    public function update(StoreTableRequest $request, int $id): JsonResponse
    {
        $table = RestaurantTable::find($id);

        if (!$table) {
            return $this->notFound('Table not found');
        }

        $duplicate = RestaurantTable::where('table_number', $request->table_number)
            ->where('id', '!=', $table->id)
            ->exists();

        if ($duplicate) {
            return $this->error('Table number already exists', 422);
        }

        $data = $request->validated();
        if (array_key_exists('area', $data)) {
            if (blank($data['area'])) {
                unset($data['area']);
            } elseif ($data['area'] !== $table->area) {
                // Its spot on the old floor means nothing on the new one; let it auto-place
                $data['pos_x'] = null;
                $data['pos_y'] = null;
            }
        }

        $original = $table->toArray();
        $table->update($data);

        AuditLogger::logUpdated($table, $original);

        return $this->success($table->fresh(), 'Table updated');
    }

    public function destroy(int $id): JsonResponse
    {
        $table = RestaurantTable::find($id);

        if (!$table) {
            return $this->notFound('Table not found');
        }

        if ($table->activeOrders()->exists()) {
            return $this->error('Cannot delete table with active orders', 422);
        }

        AuditLogger::logDeleted($table);

        $table->delete();

        return $this->success(null, 'Table deleted');
    }

    /**
     * Save where tables sit on the floor plan, from the drag-and-drop editor.
     */
    public function saveLayout(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'tables' => 'required|array|max:500',
            'tables.*.id' => 'required|integer|distinct',
            'tables.*.pos_x' => 'required|integer|min:0|max:' . RestaurantTable::CANVAS_WIDTH,
            'tables.*.pos_y' => 'required|integer|min:0|max:' . RestaurantTable::CANVAS_HEIGHT,
        ]);

        $positions = collect($validated['tables'])->keyBy('id');
        // Tenant-scoped, so another restaurant's table ids are simply not found
        $tables = RestaurantTable::whereIn('id', $positions->keys())->get();

        if ($tables->count() !== $positions->count()) {
            return $this->error('One or more tables were not found', 422);
        }

        DB::transaction(function () use ($tables, $positions) {
            foreach ($tables as $table) {
                $table->update([
                    'pos_x' => $positions[$table->id]['pos_x'],
                    'pos_y' => $positions[$table->id]['pos_y'],
                ]);
            }
        });

        AuditLogger::logAction('table_layout_saved', null, ['tables' => $tables->count()]);

        return $this->success(null, 'Layout saved');
    }

    public function renameArea(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from' => 'required|string|max:50',
            'to' => 'required|string|max:50|different:from',
        ]);

        if (RestaurantTable::where('area', $validated['to'])->exists()) {
            return $this->error('An area with that name already exists', 422);
        }

        $renamed = RestaurantTable::where('area', $validated['from'])->update(['area' => $validated['to']]);

        if (!$renamed) {
            return $this->notFound('Area not found');
        }

        AuditLogger::logAction('table_area_renamed', null, $validated);

        return $this->success(['area' => $validated['to']], 'Area renamed');
    }

    public function transfer(TransferTableRequest $request): JsonResponse
    {
        $fromTable = RestaurantTable::find($request->from_table_id);
        $toTable = RestaurantTable::find($request->to_table_id);

        if (!$fromTable || !$toTable) {
            return $this->notFound('Table not found');
        }

        if (!$fromTable->activeOrders()->exists()) {
            return $this->error('No active orders on source table', 422);
        }

        if ($toTable->activeOrders()->exists()) {
            return $this->error('Destination table already has active orders', 422);
        }

        // Transfer all active orders
        $fromTable->activeOrders()->update(['table_id' => $toTable->id]);

        $fromTable->markAvailable();
        $toTable->markOccupied();

        try {
            broadcast(new TableTransferred($fromTable, $toTable))->toOthers();
        } catch (\Throwable $e) {
            report($e);
        }

        AuditLogger::logAction('table_transferred', $fromTable, [
            'from_table_id' => $fromTable->id,
            'to_table_id' => $toTable->id,
        ]);

        return $this->success([
            'from_table' => $fromTable->fresh(),
            'to_table' => $toTable->fresh()->load('activeOrders'),
        ], 'Table transferred successfully');
    }

    public function generateQrCode(int $id): JsonResponse
    {
        $table = RestaurantTable::find($id);

        if (!$table) {
            return $this->notFound('Table not found');
        }

        $tenant = Tenant::find($table->tenant_id);

        return $this->success([
            'table' => $table,
            'qr_url' => $this->tableQrUrl($table, $tenant),
            'qr_identifier' => $table->qr_code,
        ]);
    }

    /**
     * QR links for every table at once, for printing a full set of table cards.
     */
    public function qrCodes(): JsonResponse
    {
        $tenant = Tenant::find(auth()->user()->tenant_id);

        $cards = RestaurantTable::orderBy('table_number')->get()->map(fn (RestaurantTable $table) => [
            'table' => $table->only(['id', 'table_number', 'capacity', 'area']),
            'qr_url' => $this->tableQrUrl($table, $tenant),
        ]);

        return $this->success($cards->values());
    }

    /**
     * A table's QR link. The identifier is created once and then reused, so printed
     * cards stay valid and the QR image doesn't change every time it's viewed.
     */
    private function tableQrUrl(RestaurantTable $table, ?Tenant $tenant): string
    {
        if (!$table->qr_code) {
            $table->update(['qr_code' => $this->generateQrIdentifier($table->tenant_id, $table->table_number)]);
        }

        $slug = $tenant ? $tenant->slug : $table->tenant_id;

        return config('app.frontend_url') . "/restaurant/{$slug}?table={$table->id}&qr={$table->qr_code}";
    }

    public function generateParcelQr(): JsonResponse
    {
        $tenantId = auth()->user()->tenant_id;
        $tenant = Tenant::find($tenantId);
        $slug = $tenant ? $tenant->slug : $tenantId;
        // Stable per restaurant (no column to store it in), so printed takeaway cards keep working
        $qrIdentifier = 'PARCEL-' . Str::upper(substr(hash_hmac('sha256', "parcel:{$tenantId}", config('app.key')), 0, 8));

        $qrUrl = config('app.frontend_url') . "/restaurant/{$slug}?type=parcel&qr={$qrIdentifier}";

        return $this->success([
            'qr_url' => $qrUrl,
            'qr_identifier' => $qrIdentifier,
        ]);
    }

    private function generateQrIdentifier(int $tenantId, string $tableNumber): string
    {
        return 'TBL-' . $tenantId . '-' . $tableNumber . '-' . Str::upper(Str::random(6));
    }
}

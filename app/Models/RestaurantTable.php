<?php

namespace App\Models;

use App\Models\Order;
use App\Models\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class RestaurantTable extends Model
{
    use HasFactory, BelongsToTenant;

    protected $table = 'restaurant_tables';

    protected $fillable = [
        'tenant_id',
        'table_number',
        'qr_code',
        'status',
        'capacity',
        'area',
        'pos_x',
        'pos_y',
    ];

    // Bounds for pos_x / pos_y. The width is the editor's canvas (FLOOR_WIDTH in
    // floorLayout.js); the canvas grows downwards, so the height only guards against junk.
    public const CANVAS_WIDTH = 960;
    public const CANVAS_HEIGHT = 10000;

    protected function casts(): array
    {
        return [
            'capacity' => 'integer',
            'pos_x' => 'integer',
            'pos_y' => 'integer',
            // Filled by withMin() on the table list; cast so it serialises as ISO 8601 with a timezone
            'active_orders_min_created_at' => 'datetime',
        ];
    }

    // Relationships
    public function orders()
    {
        return $this->hasMany(Order::class, 'table_id');
    }

    public function activeOrders()
    {
        return $this->hasMany(Order::class, 'table_id')
            ->whereNotIn('status', ['completed', 'cancelled']);
    }

    // Scopes
    public function scopeAvailable($query)
    {
        return $query->where('status', 'available');
    }

    public function scopeActive($query)
    {
        return $query->where('status', '!=', 'inactive');
    }

    // Helpers
    public function isOccupied(): bool
    {
        return $this->status === 'occupied';
    }

    public function markOccupied(): void
    {
        $this->update(['status' => 'occupied']);
    }

    public function markAvailable(): void
    {
        $this->update(['status' => 'available']);
    }
}

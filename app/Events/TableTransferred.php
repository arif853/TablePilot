<?php

namespace App\Events;

use App\Models\RestaurantTable;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class TableTransferred implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public RestaurantTable $fromTable,
        public RestaurantTable $toTable
    ) {}

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('tenant.' . $this->fromTable->tenant_id . '.orders'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'table.transferred';
    }

    public function broadcastWith(): array
    {
        return [
            'from_table' => [
                'id' => $this->fromTable->id,
                'table_number' => $this->fromTable->table_number,
                'status' => $this->fromTable->status,
            ],
            'to_table' => [
                'id' => $this->toTable->id,
                'table_number' => $this->toTable->table_number,
                'status' => $this->toTable->status,
            ],
        ];
    }
}

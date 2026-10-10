<?php

namespace App\Events;

use App\Models\MenuItem;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class MenuItemAvailabilityChanged implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public MenuItem $menuItem
    ) {}

    public function broadcastOn(): array
    {
        return [
            new Channel('tenant.' . $this->menuItem->tenant_id . '.menu'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'menu.availability.changed';
    }

    public function broadcastWith(): array
    {
        return [
            'menu_item_id' => $this->menuItem->id,
            'name' => $this->menuItem->name,
            'is_active' => $this->menuItem->is_active,
        ];
    }
}

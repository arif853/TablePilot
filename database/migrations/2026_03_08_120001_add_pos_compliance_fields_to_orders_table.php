<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE orders MODIFY COLUMN type ENUM('dine','parcel','quick','delivery') NOT NULL DEFAULT 'dine'");
            DB::statement("ALTER TABLE orders MODIFY COLUMN payment_method ENUM('cash','card','mobile_banking','bkash','nagad','rocket','split','online') NOT NULL DEFAULT 'cash'");
        }

        Schema::table('orders', function (Blueprint $table) {
            $table->text('delivery_address')->nullable()->after('customer_phone');
            $table->decimal('sd_rate', 5, 2)->default(0)->after('vat_rate');
            $table->decimal('sd_amount', 12, 2)->default(0)->after('vat_amount');
            $table->json('split_payment_details')->nullable()->after('payment_gateway');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['delivery_address', 'sd_rate', 'sd_amount', 'split_payment_details']);
        });

        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE orders MODIFY COLUMN type ENUM('dine','parcel','quick') NOT NULL DEFAULT 'dine'");
            DB::statement("ALTER TABLE orders MODIFY COLUMN payment_method ENUM('cash','card','mobile_banking','online') NOT NULL DEFAULT 'cash'");
        }
    }
};

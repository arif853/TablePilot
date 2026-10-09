<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Extend payment_method enum to include card and mobile_banking
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE orders MODIFY COLUMN payment_method ENUM('cash','card','mobile_banking','online') NOT NULL DEFAULT 'cash'");
        }

        // 2. Add source column (customer = QR self-order, pos = staff-created)
        Schema::table('orders', function (Blueprint $table) {
            $table->enum('source', ['customer', 'pos'])->default('customer')->after('paid_at');
            $table->unsignedBigInteger('served_by')->nullable()->after('source');
            $table->foreign('served_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropForeign(['served_by']);
            $table->dropColumn(['source', 'served_by']);
        });

        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE orders MODIFY COLUMN payment_method ENUM('cash','online') NOT NULL DEFAULT 'cash'");
        }
    }
};

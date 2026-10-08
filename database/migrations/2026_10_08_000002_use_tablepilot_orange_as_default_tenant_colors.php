<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Switch the default restaurant colours from the old blue to TablePilot orange.
 * Only restaurants still on the untouched blue pair are migrated; anyone who picked
 * their own colours keeps them.
 */
return new class extends Migration
{
    private const OLD = ['primary' => '#3B82F6', 'secondary' => '#1E40AF'];
    private const NEW = ['primary' => '#ED802A', 'secondary' => '#B8560E'];

    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->string('primary_color', 20)->default(self::NEW['primary'])->change();
            $table->string('secondary_color', 20)->default(self::NEW['secondary'])->change();
        });

        DB::table('tenants')
            ->whereRaw('UPPER(primary_color) = ?', [self::OLD['primary']])
            ->whereRaw('UPPER(secondary_color) = ?', [self::OLD['secondary']])
            ->update(['primary_color' => self::NEW['primary'], 'secondary_color' => self::NEW['secondary']]);
    }

    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->string('primary_color', 20)->default(self::OLD['primary'])->change();
            $table->string('secondary_color', 20)->default(self::OLD['secondary'])->change();
        });

        DB::table('tenants')
            ->where('primary_color', self::NEW['primary'])
            ->where('secondary_color', self::NEW['secondary'])
            ->update(['primary_color' => self::OLD['primary'], 'secondary_color' => self::OLD['secondary']]);
    }
};

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

class PlatformSetting extends Model
{
    protected $fillable = ['key', 'value', 'type', 'group'];

    /**
     * Get a setting value by key.
     */
    public static function getValue(string $key, $default = null)
    {
        return Cache::remember("platform_setting.{$key}", 3600, function () use ($key, $default) {
            $setting = static::where('key', $key)->first();
            return $setting ? $setting->value : $default;
        });
    }

    /**
     * Set a setting value.
     */
    public static function setValue(string $key, $value, string $type = 'text', string $group = 'general'): static
    {
        $setting = static::updateOrCreate(
            ['key' => $key],
            ['value' => $value, 'type' => $type, 'group' => $group]
        );

        Cache::forget("platform_setting.{$key}");
        Cache::forget('platform_settings.branding');

        return $setting;
    }

    /**
     * Get all settings for a group.
     */
    public static function getGroup(string $group): array
    {
        return Cache::remember("platform_settings.{$group}", 3600, function () use ($group) {
            return static::where('group', $group)
                ->pluck('value', 'key')
                ->toArray();
        });
    }

    /**
     * Get public branding settings (cached).
     */
    public static function getBranding(): array
    {
        return Cache::remember('platform_settings.branding', 3600, function () {
            $settings = static::where('group', 'branding')->pluck('value', 'key')->toArray();

            return [
                'platform_name'     => $settings['platform_name'] ?? 'TablePilot',
                'platform_logo'     => $settings['platform_logo'] ?? null,
                'platform_logo_dark'=> $settings['platform_logo_dark'] ?? null,
                'platform_favicon'  => $settings['platform_favicon'] ?? null,
                'primary_color'     => $settings['primary_color'] ?? '#ED802A',
                'secondary_color'   => $settings['secondary_color'] ?? '#B8560E',
                'footer_text'       => $settings['footer_text'] ?? null,
                'powered_by_text'   => $settings['powered_by_text'] ?? 'Powered by TablePilot',
                'powered_by_url'    => $settings['powered_by_url'] ?? null,
            ];
        });
    }
}

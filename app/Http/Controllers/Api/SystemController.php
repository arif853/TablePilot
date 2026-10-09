<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\BaseApiController;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class SystemController extends BaseApiController
{
    /**
     * Public health check endpoint used by load balancers.
     */
    public function publicHealth(): JsonResponse
    {
        try {
            DB::connection()->getPdo();

            return response()->json([
                'status' => 'healthy',
                'version' => config('app.version'),
                'timestamp' => now()->toIso8601String(),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'status' => 'unhealthy',
                'version' => config('app.version'),
                'timestamp' => now()->toIso8601String(),
            ], 503);
        }
    }

    /**
     * Get system health status.
     */
    public function health(): JsonResponse
    {
        $checks = [];

        // Database check
        try {
            DB::connection()->getPdo();
            $checks['database'] = [
                'status' => 'ok',
                'message' => 'Connected',
            ];
        } catch (\Exception $e) {
            $checks['database'] = [
                'status' => 'error',
                'message' => 'Connection failed: ' . $e->getMessage(),
            ];
        }

        // Cache check
        try {
            Cache::put('health_check', true, 10);
            $cacheWorks = Cache::get('health_check') === true;
            Cache::forget('health_check');

            $checks['cache'] = [
                'status' => $cacheWorks ? 'ok' : 'error',
                'message' => $cacheWorks ? 'Working' : 'Cache read/write failed',
                'driver' => config('cache.default'),
            ];
        } catch (\Exception $e) {
            $checks['cache'] = [
                'status' => 'error',
                'message' => 'Cache error: ' . $e->getMessage(),
            ];
        }

        // Storage check
        try {
            $storageWritable = Storage::disk('public')->put('health_test.txt', 'test');
            if ($storageWritable) {
                Storage::disk('public')->delete('health_test.txt');
            }

            $checks['storage'] = [
                'status' => $storageWritable ? 'ok' : 'error',
                'message' => $storageWritable ? 'Writable' : 'Not writable',
            ];
        } catch (\Exception $e) {
            $checks['storage'] = [
                'status' => 'error',
                'message' => 'Storage error: ' . $e->getMessage(),
            ];
        }

        // Queue check (jobs table)
        try {
            $pendingJobs = DB::table('jobs')->count();
            $failedJobs = DB::table('failed_jobs')->count();

            $checks['queue'] = [
                'status' => 'ok',
                'message' => "Pending: {$pendingJobs}, Failed: {$failedJobs}",
                'pending_jobs' => $pendingJobs,
                'failed_jobs' => $failedJobs,
            ];
        } catch (\Exception $e) {
            $checks['queue'] = [
                'status' => 'warning',
                'message' => 'Queue tables not available: ' . $e->getMessage(),
            ];
        }

        // Calculate overall status
        $hasError = collect($checks)->contains(fn($check) => $check['status'] === 'error');
        $hasWarning = collect($checks)->contains(fn($check) => $check['status'] === 'warning');

        return $this->success([
            'status' => $hasError ? 'unhealthy' : ($hasWarning ? 'degraded' : 'healthy'),
            'checks' => $checks,
            'timestamp' => now()->toIso8601String(),
            'app_version' => config('app.version'),
            'php_version' => PHP_VERSION,
            'laravel_version' => app()->version(),
        ]);
    }

    /**
     * Get queue statistics.
     */
    public function queueStats(): JsonResponse
    {
        try {
            $pendingJobs = DB::table('jobs')
                ->select('queue', DB::raw('COUNT(*) as count'))
                ->groupBy('queue')
                ->get();

            $failedJobs = DB::table('failed_jobs')
                ->select('queue', DB::raw('COUNT(*) as count'))
                ->groupBy('queue')
                ->get();

            $recentFailed = DB::table('failed_jobs')
                ->orderByDesc('failed_at')
                ->limit(10)
                ->get(['id', 'uuid', 'queue', 'failed_at', 'exception']);

            return $this->success([
                'pending' => [
                    'total' => $pendingJobs->sum('count'),
                    'by_queue' => $pendingJobs,
                ],
                'failed' => [
                    'total' => $failedJobs->sum('count'),
                    'by_queue' => $failedJobs,
                    'recent' => $recentFailed->map(function ($job) {
                        return [
                            'id' => $job->id,
                            'uuid' => $job->uuid,
                            'queue' => $job->queue,
                            'failed_at' => $job->failed_at,
                            'exception_preview' => substr($job->exception, 0, 200) . '...',
                        ];
                    }),
                ],
            ]);
        } catch (\Exception $e) {
            return $this->error('Failed to get queue stats: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Retry all failed jobs.
     */
    public function retryFailedJobs(): JsonResponse
    {
        try {
            $failedCount = DB::table('failed_jobs')->count();

            if ($failedCount === 0) {
                return $this->success(['retried' => 0], 'No failed jobs to retry');
            }

            Artisan::call('queue:retry', ['--all' => true]);

            return $this->success([
                'retried' => $failedCount,
            ], "{$failedCount} failed jobs queued for retry");
        } catch (\Exception $e) {
            return $this->error('Failed to retry jobs: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Clear various caches.
     */
    public function clearCache(Request $request): JsonResponse
    {
        $request->validate([
            'type' => 'required|in:all,config,routes,views,cache',
        ]);

        $type = $request->type;
        $cleared = [];

        try {
            if ($type === 'all' || $type === 'cache') {
                Artisan::call('cache:clear');
                $cleared[] = 'application cache';
            }

            if ($type === 'all' || $type === 'config') {
                Artisan::call('config:clear');
                $cleared[] = 'config cache';
            }

            if ($type === 'all' || $type === 'routes') {
                Artisan::call('route:clear');
                $cleared[] = 'route cache';
            }

            if ($type === 'all' || $type === 'views') {
                Artisan::call('view:clear');
                $cleared[] = 'view cache';
            }

            return $this->success([
                'cleared' => $cleared,
            ], 'Cache cleared: ' . implode(', ', $cleared));
        } catch (\Exception $e) {
            return $this->error('Failed to clear cache: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Create the public storage symbolic link.
     */
    public function storageLink(): JsonResponse
    {
        try {
            $linkPath = public_path('storage');

            if (is_link($linkPath) || file_exists($linkPath)) {
                return $this->success([
                    'linked' => false,
                    'already_exists' => true,
                ], 'Storage link already exists');
            }

            Artisan::call('storage:link');

            return $this->success([
                'linked' => true,
                'output' => trim(Artisan::output()),
            ], 'Storage link created successfully');
        } catch (\Exception $e) {
            return $this->error('Failed to create storage link: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Get recent log entries.
     */
    public function logs(Request $request): JsonResponse
    {
        $lines = $request->get('lines', 100);
        $lines = min(max((int) $lines, 10), 500); // Between 10 and 500

        $logPath = storage_path('logs/laravel.log');

        if (!file_exists($logPath)) {
            return $this->success([
                'logs' => [],
                'message' => 'Log file not found',
            ]);
        }

        try {
            // Read last N lines efficiently
            $file = new \SplFileObject($logPath, 'r');
            $file->seek(PHP_INT_MAX);
            $totalLines = $file->key();

            $startLine = max(0, $totalLines - $lines);
            $file->seek($startLine);

            $logs = [];
            while (!$file->eof()) {
                $line = $file->fgets();
                if (trim($line)) {
                    // Parse log level
                    $level = 'info';
                    if (preg_match('/\.(ERROR|error)/', $line)) {
                        $level = 'error';
                    } elseif (preg_match('/\.(WARNING|warning)/', $line)) {
                        $level = 'warning';
                    } elseif (preg_match('/\.(DEBUG|debug)/', $line)) {
                        $level = 'debug';
                    }

                    $logs[] = [
                        'line' => trim($line),
                        'level' => $level,
                    ];
                }
            }

            return $this->success([
                'logs' => $logs,
                'total_lines' => $totalLines,
                'showing' => count($logs),
            ]);
        } catch (\Exception $e) {
            return $this->error('Failed to read logs: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Get system info.
     */
    public function info(): JsonResponse
    {
        return $this->success([
            'app_version' => config('app.version'),
            'php_version' => PHP_VERSION,
            'laravel_version' => app()->version(),
            'environment' => app()->environment(),
            'debug_mode' => config('app.debug'),
            'timezone' => config('app.timezone'),
            'locale' => config('app.locale'),
            'cache_driver' => config('cache.default'),
            'session_driver' => config('session.driver'),
            'queue_driver' => config('queue.default'),
            'mail_driver' => config('mail.default'),
            'db_driver' => config('database.default'),
        ]);
    }
}

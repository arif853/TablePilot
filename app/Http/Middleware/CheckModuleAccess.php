<?php

namespace App\Http\Middleware;

use App\Services\ModulePermissionService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class CheckModuleAccess
{
    public function __construct(
        protected ModulePermissionService $moduleService
    ) {}

    /**
     * Handle an incoming request.
     * Check if the user's tenant has access to the specified module.
     * Usage in routes: ->middleware('module:pos')
     *
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next, string $moduleKey): Response
    {
        $user = Auth::guard('api')->user();

        // Super admin bypasses all module checks
        if ($user && $user->role === 'super_admin') {
            return $next($request);
        }

        // Get the tenant from the authenticated user
        $tenant = $user?->tenant;

        if (!$tenant) {
            return response()->json([
                'success'    => false,
                'message'    => 'No tenant associated with this user.',
                'error_code' => 'NO_TENANT',
            ], 403);
        }

        // Check if tenant has access to this module
        if (!$this->moduleService->tenantHasModule($tenant, $moduleKey)) {
            return response()->json([
                'success'    => false,
                'message'    => 'Your subscription plan does not include access to this feature.',
                'error_code' => 'MODULE_ACCESS_DENIED',
                'module'     => $moduleKey,
            ], 403);
        }

        return $next($request);
    }
}

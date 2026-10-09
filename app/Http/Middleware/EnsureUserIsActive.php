<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * JWTs stay valid until they expire, so login-time status checks alone let a
 * deactivated user keep working (and keep refreshing) on an existing token.
 */
class EnsureUserIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && !$user->isActive()) {
            return response()->json([
                'success' => false,
                'message' => 'Your account has been deactivated. Contact your administrator.',
            ], 401);
        }

        return $next($request);
    }
}

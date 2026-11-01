<?php

namespace App\Http\Middleware;

use App\Services\LoginTokenService;
use Closure;
use Exception;

class CheckJWT
{
    /**
     * Handle an incoming request.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \Closure  $next
     * @return mixed
     */

    public $key = "key";

    public function handle($request, Closure $next)
    {
        $tokenService = new LoginTokenService();

        try {
            $token = $tokenService->bearerTokenFromRequest($request);

            if (!$token) {
                return response()->json([
                    'code' => '401',
                    'status' => false,
                    'message' => 'Token Not Found',
                    'data' => [],
                ], 401);
            }

            $payload = $tokenService->decodeAndValidate($token);
            $request->request->add([
                'login_id' => $payload->aud,
                'login_by' => $payload->lun,
            ]);

        } catch (\Firebase\JWT\ExpiredException $e) {
            return response()->json([
                'code' => '401',
                'status' => false,
                'message' => 'Token is expire',
                'data' => $tokenService->expiredStatusData(),
            ], 401);
        } catch (\RuntimeException $e) {
            return response()->json([
                'code' => '401',
                'status' => false,
                'message' => $e->getMessage(),
                'data' => [],
            ], 401);
        } catch (Exception $e) {
            return response()->json([
                'code' => '401',
                'status' => false,
                'message' => 'Can not verify identity'.$e,
                'data' => [],
            ], 401);
        }

        return $next($request);
    }
}

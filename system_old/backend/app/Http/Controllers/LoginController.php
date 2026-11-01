<?php

namespace App\Http\Controllers;

use App\Models\MenuPermission;
use App\Models\User;
use App\Models\Member;
use App\Services\LoginTokenService;
use Carbon\Carbon;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use \Firebase\JWT\JWT;

class LoginController extends Controller
{
    public $key = "key";

    private function resolveDepartmentForUser(User $user): ?string
    {
        $employee = DB::table('employees')
            ->where('username', $user->username)
            ->orWhere('email', $user->email)
            ->first();

        return $employee->department_name ?? null;
    }

    private function tokenLoginByFromUser(User $user): object
    {
        // Fetch employee code if it exists for this user
        $employeeCode = DB::table('employees')
            ->where('username', $user->username)
            ->value('code');

        // Keep JWT small: do not embed menus/employee or other relations.
        // Many endpoints only need id/user_id (+ sometimes permission_id).
        return (object) [
            'id'            => $user->id,
            'user_id'       => $user->id,
            'username'      => $user->username,
            'permission_id' => $user->permission_id ?? null,
            'employee_code' => $employeeCode ?? null,
        ];
    }

    private function loginTokenTtlSeconds(): int
    {
        return $this->loginTokenService()->ttlSeconds();
    }

    private function loginTokenService(): LoginTokenService
    {
        return new LoginTokenService();
    }

    public function genToken($id, $name)
    {
        $issuedAt = Carbon::now()->timestamp;

        $payload = array(
            "iss" => "key",
            "aud" => $id,
            "lun" => $name,
            "iat" => $issuedAt,
            "exp" => $issuedAt + $this->loginTokenTtlSeconds(),
            "nbf" => $issuedAt,
        );

        $token = JWT::encode($payload, $this->key);
        return $token;
    }

    public function checkLogin(Request $request)
    {
        $tokenService = $this->loginTokenService();
        $token = $tokenService->bearerTokenFromRequest($request);

        try {

            if ($token == "") {
                return $this->returnError('Token Not Found', 401);
            }

            $payload = $tokenService->decodeAndValidate($token);

            return response()->json([
                'code' => '200',
                'status' => true,
                'message' => 'Active',
                'data' => $tokenService->tokenStatusData($payload),
                'token' => $token,
            ], 200);
        } catch (\Firebase\JWT\ExpiredException $e) {
            return response()->json([
                'code' => '401',
                'status' => false,
                'message' => 'Token is expire',
                'data' => $tokenService->expiredStatusData(),
            ], 401);

        } catch (\RuntimeException $e) {
            return $this->returnError($e->getMessage(), 401);

        } catch (Exception $e) {
            return $this->returnError('Can not verify identity', 401);
        }
    }

    public function login(Request $request)
    {
        if (!isset($request->username)) {
            return $this->returnErrorData('[username] ไม่มีข้อมูล', 404);
        } else if (!isset($request->password)) {
            return $this->returnErrorData('[password] ไม่มีข้อมูล', 404);
        }

        $user = User::where('username', $request->username)
            ->where('password', md5($request->password))
            ->first();

        if ($user) {
            $user->department = $this->resolveDepartmentForUser($user);

            //log
            $username = $user->username;
            $log_type = 'เข้าสู่ระบบ';
            $log_description = 'ผู้ใช้งาน ' . $username . ' ได้ทำการ ' . $log_type;
            $this->Log($username, $log_description, $log_type);
            //

            return response()->json([
                'code' => '200',
                'status' => true,
                'message' => 'เข้าสู่ระบบสำเร็จ',
                'data' => $user,
                'token' => $this->genToken($user->id, $this->tokenLoginByFromUser($user)),
            ], 200);
        } else {
            return $this->returnError('รหัสผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง', 401);
        }

    }

    public function loginLdap(Request $request)
    {
        if (!isset($request->username)) {
            return $this->returnErrorData('[username] ไม่มีข้อมูล', 404);
        } else if (!isset($request->password)) {
            return $this->returnErrorData('[password] ไม่มีข้อมูล', 404);
        }

        if (!function_exists('ldap_connect')) {
            return response()->json([
                'code' => '500',
                'status' => false,
                'message' => 'LDAP extension is not enabled on this server.',
                'data' => [],
            ], 500);
        }


        $username = (string) $request->username;
        $password = (string) $request->password;

        $config = config('services.ldap', []);
        $ldapUrl = data_get($config, 'url');

        if (empty($ldapUrl)) {
            return response()->json([
                'code' => '500',
                'status' => false,
                'message' => 'LDAP is not configured (LDAP_URL).',
                'data' => [],
            ], 500);
        }

        $connection = @ldap_connect($ldapUrl);
        if (!$connection) {
            return response()->json([
                'code' => '500',
                'status' => false,
                'message' => 'Unable to connect to LDAP server.',
                'data' => [],
            ], 500);
        }

        @ldap_set_option($connection, LDAP_OPT_PROTOCOL_VERSION, 3);
        @ldap_set_option($connection, LDAP_OPT_REFERRALS, 0);
        @ldap_set_option($connection, LDAP_OPT_NETWORK_TIMEOUT, (int) data_get($config, 'timeout', 5));

        if (data_get($config, 'start_tls', false)) {
            if (!@ldap_start_tls($connection)) {
                return response()->json([
                    'code' => '500',
                    'status' => false,
                    'message' => 'Failed to start TLS with LDAP server.',
                    'data' => [],
                ], 500);
            }
        }

        $userDn = null;
        $bindDn = data_get($config, 'bind_dn');
        $bindPassword = data_get($config, 'bind_password');

        if (!empty($bindDn)) {
            if (!@ldap_bind($connection, $bindDn, (string) $bindPassword)) {
                return response()->json([
                    'code' => '500',
                    'status' => false,
                    'message' => 'LDAP service bind failed (LDAP_BIND_DN / LDAP_BIND_PASSWORD).',
                    'data' => [],
                ], 500);
            }

            $baseDn = data_get($config, 'base_dn');
            if (empty($baseDn)) {
                return response()->json([
                    'code' => '500',
                    'status' => false,
                    'message' => 'LDAP base DN is not configured (LDAP_BASE_DN).',
                    'data' => [],
                ], 500);
            }

            $attribute = (string) data_get($config, 'user_attribute', 'sAMAccountName');
            $escaped = $this->ldapEscapeFilterValue($username);
            $filter = '(' . $attribute . '=' . $escaped . ')';

            $search = @ldap_search($connection, $baseDn, $filter, ['dn']);
            if (!$search) {
                return $this->returnError('รหัสผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
            }

            $entries = @ldap_get_entries($connection, $search);
            if (!is_array($entries) || empty($entries['count']) || empty($entries[0]['dn'])) {
                return $this->returnError('รหัสผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
            }

            $userDn = (string) $entries[0]['dn'];

            if (!@ldap_bind($connection, $userDn, $password)) {
                return $this->returnError('รหัสผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
            }
        } else {
            $template = data_get($config, 'user_dn_template');
            if (empty($template)) {
                return response()->json([
                    'code' => '500',
                    'status' => false,
                    'message' => 'LDAP user DN template is not configured (LDAP_USER_DN_TEMPLATE).',
                    'data' => [],
                ], 500);
            }

            $userDn = sprintf((string) $template, $username);
            if (!@ldap_bind($connection, $userDn, $password)) {
                return $this->returnError('รหัสผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
            }
        }

        $employee = DB::table('employees')
            ->where('username', $username)
            ->orWhere('email', $username)
            ->first();

        if (!$employee) {
            return $this->returnErrorData('ไม่พบข้อมูลพนักงานในระบบ', 404);
        }

        // Block inactive employees at LDAP login (allow-list should not be bypassed).
        $employeeActive = isset($employee->active) ? strtolower(trim((string) $employee->active)) : '';
        if ($employeeActive !== '' && in_array($employeeActive, ['0', 'no', 'false', 'inactive', 'n'], true)) {
            return $this->returnError('บัญชีพนักงานถูกระงับการใช้งาน', 403);
        }

        // Enforce allow-list: user record must exist and be approved, so admin can set permissions before first login.
        $principalUsername = !empty($employee->username) ? (string) $employee->username : $username;
        $user = User::where('username', $principalUsername)->first();
        if (!$user && !empty($employee->email)) {
            $user = User::where('email', $employee->email)->first();
        }

        if (!$user) {
            return $this->returnError('ยังไม่ได้รับอนุญาตให้เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ', 403);
        }

        if ($user->status !== 'Yes') {
            return $this->returnError('ยังไม่ได้รับอนุญาตให้เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ', 403);
        }

        $logType = 'เข้าสู่ระบบ (LDAP)';
        $logDescription = 'ผู้ใช้งาน ' . $username . ' ได้ทำการ ' . $logType;
        $this->Log($username, $logDescription, $logType);

        // Return user as the auth principal, but include employee profile for UI needs.
        $user->employee = $employee;
        $user->department = $employee->department_name ?? null;

        return response()->json([
            'code' => '200',
            'status' => true,
            'message' => 'เข้าสู่ระบบสำเร็จ',
            'data' => $user,
            'token' => $this->genToken($user->id, $this->tokenLoginByFromUser($user)),
        ], 200);
    }

    private function ldapEscapeFilterValue($value)
    {
        if (function_exists('ldap_escape')) {
            return ldap_escape($value, '', LDAP_ESCAPE_FILTER);
        }

        $value = (string) $value;
        $search = ['\\', '*', '(', ')', "\x00"];
        $replace = ['\\5c', '\\2a', '\\28', '\\29', '\\00'];
        return str_replace($search, $replace, $value);
    }

    public function loginMember(Request $request)
    {
        if (!isset($request->username)) {
            return $this->returnErrorData('[username] ไม่มีข้อมูล', 404);
        } else if (!isset($request->password)) {
            return $this->returnErrorData('[password] ไม่มีข้อมูล', 404);
        }

        $user = Member::where('username', $request->username)
            ->where('password', md5($request->password))
            ->first();

        if ($user) {

            //log
            $username = $user->username;
            $log_type = 'เข้าสู่ระบบ';
            $log_description = 'ผู้ใช้งาน ' . $username . ' ได้ทำการ ' . $log_type;
            $this->Log($username, $log_description, $log_type);
            //

            return response()->json([
                'code' => '200',
                'status' => true,
                'message' => 'เข้าสู่ระบบสำเร็จ',
                'data' => $user,
                'token' => $this->genToken($user->id, $user),
            ], 200);
        } else {
            return $this->returnError('รหัสผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง', 401);
        }

    }

}

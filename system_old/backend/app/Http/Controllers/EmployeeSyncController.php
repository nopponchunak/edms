<?php
namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;

class EmployeeSyncController extends Controller
{
    public function sync(Request $request)
    {
        @set_time_limit(300);
        DB::disableQueryLog();

        $url = config('services.hrm_employee.url');
        if (empty($url)) {
            return response()->json([
                'error'   => true,
                'message' => 'HRM employee API URL is not configured.',
            ], 500);
        }

        $lastSync     = $request->input('last_sync');
        $query        = [];
        $updatedParam = config('services.hrm_employee.updated_param', 'updatedAt');
        if (! empty($lastSync)) {
            $query[$updatedParam] = $lastSync;
        }

        $client = Http::timeout(60)->acceptJson();
        if (! config('services.hrm_employee.verify_ssl', true)) {
            $client = $client->withoutVerifying();
        }

        $response = $client->get($url, $query);

        if (! $response->successful()) {
            return response()->json([
                'error'   => true,
                'message' => 'Failed to fetch employees from HRM API.',
                'status'  => $response->status(),
                'body'    => $response->body(),
            ], 502);
        }

        $payload   = $response->json();
        $employees = [];

        if (is_array($payload) && isset($payload['data']) && is_array($payload['data'])) {
            $employees = $payload['data'];
        } elseif (is_array($payload) && isset($payload['data']['data']) && is_array($payload['data']['data'])) {
            $employees = $payload['data']['data'];
        } elseif (is_array($payload)) {
            $employees = $payload;
        }

        if (empty($employees)) {
            return response()->json([
                'error'   => false,
                'message' => 'No employees to sync.',
                'synced'  => 0,
            ]);
        }

        $now             = now();
        $hasHrmUpdatedAt = Schema::hasColumn('employees', 'hrm_updated_at');
        $hasEmployeeDeletedAt = Schema::hasColumn('employees', 'deleted_at');
        $hasUserDeletedAt = Schema::hasColumn('users', 'deleted_at');
        $synced          = 0;
        $inserted        = 0;
        $updated         = 0;
        $usersInserted   = 0;
        $usersUpdated    = 0;
        $usersSkipped    = 0;
        $maxHrmUpdatedAt = null;

        DB::transaction(function () use (
            $employees,
            $now,
            $hasHrmUpdatedAt,
            $hasEmployeeDeletedAt,
            $hasUserDeletedAt,
            $updatedParam,
            &$synced,
            &$inserted,
            &$updated,
            &$usersInserted,
            &$usersUpdated,
            &$usersSkipped,
            &$maxHrmUpdatedAt
        ) {
            $pendingPermissionId = DB::table('permissions')->where('name', 'PENDING')->value('id');
            if (empty($pendingPermissionId)) {
                throw new \RuntimeException('Missing default permission PENDING');
            }

            foreach ($employees as $employee) {
                $code = data_get($employee, 'code');
                $code = is_string($code) ? trim($code) : $code;
                if (empty($code)) {
                    continue;
                }

                $headFirst = data_get($employee, 'head.firstname');
                $headLast  = data_get($employee, 'head.lastname');
                $headName  = trim(trim((string) $headFirst) . ' ' . trim((string) $headLast));
                $headName  = $headName !== '' ? $headName : null;

                $data = [
                    'username'             => data_get($employee, 'username'),
                    'password'             => data_get($employee, 'password'),
                    'firstname'            => data_get($employee, 'firstname'),
                    'lastname'             => data_get($employee, 'lastname'),
                    'email'                => data_get($employee, 'email'),
                    'birth_date'           => data_get($employee, 'birthDate'),
                    'register_date'        => data_get($employee, 'registerDate'),
                    'pass_probation_date'  => data_get($employee, 'passProbationDate'),
                    'sex'                  => data_get($employee, 'sex'),
                    'title_id'             => data_get($employee, 'title.id'),
                    'title_name'           => data_get($employee, 'title.name'),
                    'level_id'             => data_get($employee, 'level.id'),
                    'level_name'           => data_get($employee, 'level.name'),
                    'department_id'        => data_get($employee, 'department.id'),
                    'department_name'      => data_get($employee, 'department.name'),
                    'employee_type_id'     => data_get($employee, 'employeeType.id'),
                    'employee_type_name'   => data_get($employee, 'employeeType.name'),
                    'work_shift_id'        => data_get($employee, 'workShift.id'),
                    'work_shift_name'      => data_get($employee, 'workShift.name'),
                    'head_id'              => data_get($employee, 'head.id'),
                    'head_name'            => $headName,
                    'initial'              => data_get($employee, 'initial'),
                    'is_approver'          => (bool) data_get($employee, 'isApprover', false),
                    'next_quota_update'    => data_get($employee, 'nextQuotaUpdate'),
                    'employee_status'      => data_get($employee, 'employeeStatus'),
                    'active'               => data_get($employee, 'active'),
                    'current_start_period' => data_get($employee, 'currentStartPeriod'),
                    'current_end_period'   => data_get($employee, 'currentEndPeriod'),
                    'updated_at'           => $now,
                ];

                if ($hasHrmUpdatedAt) {
                    $hrmUpdatedRaw = data_get($employee, $updatedParam);
                    $hrmUpdatedAt  = null;
                    if (is_string($hrmUpdatedRaw) && trim($hrmUpdatedRaw) !== '') {
                        try {
                            $hrmUpdatedAt = \Carbon\Carbon::parse($hrmUpdatedRaw);
                        } catch (\Throwable $e) {
                            $hrmUpdatedAt = null;
                        }
                    } elseif ($hrmUpdatedRaw instanceof \DateTimeInterface) {
                        $hrmUpdatedAt = $hrmUpdatedRaw;
                    }

                    $data['hrm_updated_at'] = $hrmUpdatedAt;

                    if ($hrmUpdatedAt !== null) {
                        if ($maxHrmUpdatedAt === null || $hrmUpdatedAt > $maxHrmUpdatedAt) {
                            $maxHrmUpdatedAt = $hrmUpdatedAt;
                        }
                    }
                }

                if ($hasEmployeeDeletedAt) {
                    $data['deleted_at'] = null;
                }

                $query = DB::table('employees')->where('code', $code);
                if ($query->exists()) {
                    $query->update($data);
                    $updated++;
                } else {
                    DB::table('employees')->insert(array_merge(
                        ['code' => $code, 'created_at' => $now],
                        $data
                    ));
                    $inserted++;
                }

                // Code is the stable HRM identity. Keep permission/status admin-controlled,
                // but refresh profile fields from HRM on every sync.
                $username = data_get($employee, 'username');
                $username = is_string($username) ? trim($username) : $username;
                $email    = data_get($employee, 'email');
                $email    = is_string($email) ? trim($email) : $email;

                if (empty($username) || empty($email)) {
                    $usersSkipped++;
                    $synced++;
                    continue;
                }

                if (is_string($username) && mb_strlen($username) > 50) {
                    $usersSkipped++;
                    $synced++;
                    continue;
                }

                if (is_string($code) && mb_strlen($code) > 50) {
                    $usersSkipped++;
                    $synced++;
                    continue;
                }

                $fullName = trim(trim((string) data_get($employee, 'firstname')) . ' ' . trim((string) data_get($employee, 'lastname')));

                $existingUser = DB::table('users')->where('code', $code)->first();
                if ($existingUser) {
                    $userData = [
                        'code'       => $code,
                        'name'       => $fullName !== '' ? $fullName : $username,
                        'email'      => $email,
                        'type'       => 'sync_ad',
                        'updated_at' => $now,
                    ];
                    if ($hasUserDeletedAt) {
                        $userData['deleted_at'] = null;
                    }

                    $usernameTakenByAnotherUser = DB::table('users')
                        ->where('username', $username)
                        ->where('id', '!=', $existingUser->id)
                        ->exists();
                    if (! $usernameTakenByAnotherUser) {
                        $userData['username'] = $username;
                    }

                    DB::table('users')->where('id', $existingUser->id)->update($userData);
                    $usersUpdated++;
                } else {
                    $usernameExists = DB::table('users')->where('username', $username)->exists();
                    if ($usernameExists) {
                        $usersSkipped++;
                        $synced++;
                        continue;
                    }

                    DB::table('users')->insert([
                        'permission_id'  => $pendingPermissionId,
                        'code'           => $code,
                        'username'       => $username,
                        'password'       => null,
                        'name'           => $fullName !== '' ? $fullName : $username,
                        'email'          => $email,
                        'type'           => 'sync_ad',
                        'phone'          => null,
                        'image'          => null,
                        'status'         => 'Request',
                        'zone_market_id' => null,
                        'create_by'      => 'system',
                        'update_by'      => 'system',
                        'created_at'     => $now,
                        'updated_at'     => $now,
                    ]);
                    $usersInserted++;
                }

                $synced++;
            }
        });

        return response()->json([
            'error'              => false,
            'message'            => 'Employees synced.',
            'synced'             => $synced,
            'inserted'           => $inserted,
            'updated'            => $updated,
            'users_inserted'     => $usersInserted,
            'users_updated'      => $usersUpdated,
            'users_skipped'      => $usersSkipped,
            'max_hrm_updated_at' => $maxHrmUpdatedAt ? $maxHrmUpdatedAt->toIso8601String() : null,
        ]);
    }
}

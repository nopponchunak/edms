<?php
namespace App\Http\Controllers;

use App\Models\Permission;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UserController extends Controller
{

    public function getList()
    {
        $Item = User::get()->toarray();

        if (! empty($Item)) {

            for ($i = 0; $i < count($Item); $i++) {
                $User[$i]['No'] = $i + 1;
            }
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $Item);
    }

    public function getListByPermission($id)
    {
        $Item = User::where('permission_id', $id)->get()->toarray();

        if (! empty($Item)) {

            for ($i = 0; $i < count($Item); $i++) {
                $User[$i]['No'] = $i + 1;
            }
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $Item);
    }

    public function getPage(Request $request)
    {
        $length = (int) ($request->length ?? 10);
        if ($length <= 0) {
            $length = 10;
        }

        $order  = $request->input('order', [['column' => 0, 'dir' => 'desc']]);
        $search = $request->input('search', ['value' => null]);
        $start  = (int) ($request->start ?? 0);
        $page   = (int) floor($start / $length) + 1;

        $Status = $request->status;
        $Type   = $request->type;

        $col = ['id', 'permission_id', 'username', 'code', 'name', 'email', 'image', 'status', 'create_by', 'update_by', 'created_at', 'updated_at'];
        $selectColumns = array_map(function ($column) {
            return 'users.' . $column;
        }, $col);

        $orderby = ['users.id', 'users.username', 'employee_profiles.initial', 'users.name', 'users.email', 'employee_profiles.title_name', 'employee_profiles.level_name', 'employee_profiles.department_name', 'users.permission_id', 'users.status', 'users.created_at'];

        $D = User::query()
            ->select($selectColumns)
            ->addSelect('employee_profiles.initial as initial')
            ->addSelect('employee_profiles.title_name as title_name')
            ->addSelect('employee_profiles.level_name as level_name')
            ->addSelect('employee_profiles.department_name as department_name')
            ->leftJoin('employees as employee_profiles', function ($join) {
                $join->on('users.code', '=', 'employee_profiles.code')
                    ->whereNull('employee_profiles.deleted_at');
            });

        if (isset($Status)) {
            $D->where('users.status', $Status);
        }
        if (! empty($Type)) {
            $D->where('users.type', $Type);
        }

        $this->applyEmployeeProfileFilter(
            $D,
            'employee_type_name',
            $request->input('employee_type_name', $request->input('employee_type'))
        );
        $this->applyEmployeeProfileFilter($D, 'title_name', $request->input('title_name', $request->input('title')));
        $this->applyEmployeeProfileFilter($D, 'level_name', $request->input('level_name', $request->input('level')));
        $this->applyEmployeeProfileFilter(
            $D,
            'department_name',
            $request->input('department_name', $request->input('department'))
        );

        $orderColumn = (int) data_get($order, '0.column', 0);
        $orderDir    = strtolower((string) data_get($order, '0.dir', 'desc')) === 'asc' ? 'asc' : 'desc';

        if (! empty($orderby[$orderColumn] ?? '')) {
            $D->orderby($orderby[$orderColumn], $orderDir);
        } else {
            $D->orderby('users.id', 'DESC');
        }

        $searchValue = trim((string) data_get($search, 'value', ''));
        if ($searchValue !== '') {

            $D->where(function ($query) use ($searchValue, $col) {

                foreach ($col as $c) {
                    $query->orWhere('users.' . $c, 'like', '%' . $searchValue . '%');
                }

                foreach (['initial', 'employee_type_name', 'title_name', 'level_name', 'department_name'] as $employeeColumn) {
                    $query->orWhere('employee_profiles.' . $employeeColumn, 'like', '%' . $searchValue . '%');
                }
            });
        }

        $d = $D->paginate($length, ['*'], 'page', $page);

        if ($d->isNotEmpty()) {

            //run no
            $No = (($page - 1) * $length);

            for ($i = 0; $i < count($d); $i++) {

                $No                = $No + 1;
                $d[$i]->No         = $No;
                $d[$i]->permission = Permission::find($d[$i]->permission_id);
            }
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $d);
    }

    public function getSyncAdFilterOptions()
    {
        try {
            $baseQuery = DB::table('users')
                ->leftJoin('employees as employee_profiles', function ($join) {
                    $join->on('users.code', '=', 'employee_profiles.code')
                        ->whereNull('employee_profiles.deleted_at');
                })
                ->whereNull('users.deleted_at')
                ->where('users.type', 'sync_ad');

            $options = [
                'employee_type_name' => $this->getDistinctEmployeeProfileOptions($baseQuery, 'employee_type_name'),
                'title_name'         => $this->getDistinctEmployeeProfileOptions($baseQuery, 'title_name'),
                'level_name'         => $this->getDistinctEmployeeProfileOptions($baseQuery, 'level_name'),
                'department_name'    => $this->getDistinctEmployeeProfileOptions($baseQuery, 'department_name'),
            ];

            return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $options);
        } catch (\Throwable $e) {
            return $this->returnErrorData('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง ' . $e->getMessage(), 500);
        }
    }

    private function applyEmployeeProfileFilter($query, string $column, $rawValue): void
    {
        $values = $this->normalizeEmployeeProfileFilterValues($rawValue);
        if (count($values) === 0) {
            return;
        }

        $qualifiedColumn = 'employee_profiles.' . $column;

        if (count($values) === 1) {
            $query->where($qualifiedColumn, $values[0]);
            return;
        }

        $query->whereIn($qualifiedColumn, $values);
    }

    private function normalizeEmployeeProfileFilterValues($rawValue): array
    {
        $values = is_array($rawValue) ? $rawValue : [$rawValue];

        return array_values(array_filter(array_map(function ($value) {
            return trim((string) $value);
        }, $values), function ($value) {
            return $value !== '';
        }));
    }

    private function getDistinctEmployeeProfileOptions($baseQuery, string $column)
    {
        return (clone $baseQuery)
            ->whereNotNull('employee_profiles.' . $column)
            ->where('employee_profiles.' . $column, '!=', '')
            ->distinct()
            ->orderBy('employee_profiles.' . $column)
            ->pluck('employee_profiles.' . $column)
            ->map(function ($value) {
                return trim((string) $value);
            })
            ->filter(function ($value) {
                return $value !== '';
            })
            ->values();
    }

    /**
     * Show the form for creating a new resource.
     *
     * @return \Illuminate\Http\Response
     */
    public function create()
    {
        //
    }

    /**
     * Store a newly created resource in storage.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \Illuminate\Http\Response
     */
    public function store(Request $request)
    {
        $loginBy = $request->login_by;

        if (! isset($request->username)) {
            return $this->returnErrorData('กรุณาระบุชื่อบัญชีผู้ใช้งานให้เรียบร้อย', 404);
        } else if (! isset($request->name)) {
            return $this->returnErrorData('กรุณาระบุชื่อผู้ใช้งานให้เรียบร้อย', 404);
        } else if (! isset($request->email)) {
            return $this->returnErrorData('กรุณาระบุอีเมล์ให้เรียบร้อย', 404);
        } else if (! isset($request->password)) {
            return $this->returnErrorData('กรุณาระบุชื่อรหัสผ่านให้เรียบร้อย', 404);
        } else
        //

        if (strlen($request->password) < 6) {
            return $this->returnErrorData('กรุณาระบุรหัสผ่านอย่างน้อย 6 หลัก', 404);
        }

        $checkUserId = User::where('username', $request->username)->first();
        if ($checkUserId) {
            return $this->returnErrorData('มีชื่อบัญชีผู้ใช้งาน ' . $request->username . ' ในระบบแล้ว', 404);
        }

        $checkEmail = User::where('email', $request->email)->first();
        if ($checkEmail) {
            return $this->returnErrorData('มีอีเมล์ ' . $request->email . ' ในระบบแล้ว', 404);
        }

        if (!empty($request->code)) {
            $checkCode = User::where('code', $request->code)->first();
            if ($checkCode) {
                return $this->returnErrorData('มีรหัสพนักงาน ' . $request->code . ' ในระบบแล้ว', 404);
            }
        }

        DB::beginTransaction();

        try {
            $Item = $this->deletedUserForCreate($request) ?: new User();
            $wasTrashed = $Item->exists && $Item->trashed();

            $this->fillCreatedUser($Item, $request, 'local');
            $Item->password = md5($request->password);

            if ($wasTrashed) {
                $Item->restore();
            } else {
                $Item->save();
            }
            //

            $actorId     = $this->resolveActorId($request);
            $type        = 'Create User';
            $description = 'User ' . $actorId . ' created user ' . $request->username;
            $this->Log($actorId, $description, $type);

            DB::commit();

            return $this->returnSuccess('ดำเนินการสำเร็จ', $Item);
        } catch (\Throwable $e) {

            DB::rollback();

            return $this->returnErrorData('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง ' . $e, 404);
        }
    }

    /**
     * Display the specified resource.
     *
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */
    public function show($id)
    {

        $Item = User::with('permission')
            ->where('id', $id)
            ->first();

        if ($Item->image) {
            $Item->image = url($Item->image);
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $Item);
    }

    /**
     * Show the form for editing the specified resource.
     *
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */
    public function edit($id)
    {
        //
    }

    /**
     * Update the specified resource in storage.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */
    public function update(Request $request, $id)
    {
        $loginBy = $request->login_by;

        if (! isset($request->username)) {
            return $this->returnErrorData('กรุณาระบุชื่อบัญชีผู้ใช้งานให้เรียบร้อย', 404);
        } else if (! isset($request->name)) {
            return $this->returnErrorData('กรุณาระบุชื่อผู้ใช้งานให้เรียบร้อย', 404);
        } else if (! isset($request->email)) {
            return $this->returnErrorData('กรุณาระบุอีเมล์ให้เรียบร้อย', 404);
        }

        $checkUser = User::where('username', $request->username)
            ->where('id', '!=', $id)
            ->first();
        if ($checkUser) {
            return $this->returnErrorData('มีชื่อบัญชีผู้ใช้งาน ' . $request->username . ' ในระบบแล้ว', 404);
        }

        $checkEmail = User::where('email', $request->email)
            ->where('id', '!=', $id)
            ->first();
        if ($checkEmail) {
            return $this->returnErrorData('มีอีเมล์ ' . $request->email . ' ในระบบแล้ว', 404);
        }

        DB::beginTransaction();

        try {
            $Item = User::find($id);
            if (! $Item) {
                return $this->returnErrorData('ไม่พบผู้ใช้งานที่ต้องการแก้ไข', 404);
            }

            $Item->permission_id = $request->permission_id;
            $Item->code          = $request->code;
            $Item->username      = $request->username;
            $Item->name          = $request->name;
            $Item->email         = $request->email;
            $Item->phone         = $request->phone;
            // อัปเดตรหัสผ่านหากส่งมา
            if (! empty($request->password)) {
                if (strlen($request->password) < 6) {
                    return $this->returnErrorData('กรุณาระบุรหัสผ่านอย่างน้อย 6 หลัก', 404);
                }
                $Item->password = md5($request->password);
            }

            // อัปโหลดรูปใหม่ถ้ามี
            if ($request->image && $request->image != null && $request->image != 'null') {
                $Item->image = $request->image;
            }

            if (empty($Item->type)) {
                $Item->type = 'local';
            }

            $Item->save();

            $actorId     = $this->resolveActorId($request);
            $type        = 'Update User';
            $description = 'User ' . $actorId . ' updated user ' . $request->username;
            $this->Log($actorId, $description, $type);

            DB::commit();

            return $this->returnSuccess('แก้ไขข้อมูลสำเร็จ', $Item);
        } catch (\Throwable $e) {
            DB::rollback();
            return $this->returnErrorData('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง ' . $e->getMessage(), 500);
        }
    }

    public function updateStatus(Request $request, $id)
    {
        $status = $request->input('status');
        if ($status === null || trim((string) $status) === '') {
            return $this->returnErrorData('กรุณาระบุ status ให้เรียบร้อย', 404);
        }

        $allowed = ['Yes', 'No', 'Request'];
        $normalized = trim((string) $status);
        if (!in_array($normalized, $allowed, true)) {
            return $this->returnErrorData('status ไม่ถูกต้อง', 404);
        }

        DB::beginTransaction();
        try {
            $item = User::find($id);
            if (!$item) {
                return $this->returnErrorData('ไม่พบผู้ใช้งานที่ต้องการแก้ไข', 404);
            }

            $oldStatus = $item->status;
            $item->status = $normalized;
            $item->save();

            if ($oldStatus !== $normalized) {
                $actorId = $this->resolveActorId($request);
                $description = 'User ' . $actorId . ' changed status for user ' . $item->username . ' from '
                    . ($oldStatus ?: '-') . ' to ' . $normalized;
                $this->Log($actorId, $description, 'Update User Status');
            }

            DB::commit();
            return $this->returnSuccess('อัปเดตสถานะสำเร็จ', $item);
        } catch (\Throwable $e) {
            DB::rollback();
            return $this->returnErrorData('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง ' . $e->getMessage(), 500);
        }
    }

    public function updateAllSyncAdStatusYes(Request $request)
    {
        DB::beginTransaction();
        try {
            $total = User::where('type', 'sync_ad')->count();
            $updated = User::where('type', 'sync_ad')
                ->where(function ($query) {
                    $query->whereNull('status')
                        ->orWhere('status', '!=', 'Yes');
                })
                ->update([
                    'status'     => 'Yes',
                    'updated_at' => Carbon::now()->toDateTimeString(),
                ]);

            if ($updated > 0) {
                $actorId = $this->resolveActorId($request);
                $description = 'User ' . $actorId . ' set ' . $updated . ' Active Directory user statuses to Yes';
                $this->Log($actorId, $description, 'Update AD User Status');
            }

            DB::commit();

            $message = $updated > 0
                ? 'อัปเดตสถานะ Active Directory users สำเร็จ'
                : 'Active Directory users ทุกคนมีสถานะ Yes อยู่แล้ว';

            return $this->returnSuccess($message, [
                'updated' => $updated,
                'total'   => $total,
            ]);
        } catch (\Throwable $e) {
            DB::rollback();
            return $this->returnErrorData('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง ' . $e->getMessage(), 500);
        }
    }

    public function updatePermission(Request $request, $id)
    {
        $permissionId = $request->input('permission_id');
        if ($permissionId === null || trim((string) $permissionId) === '') {
            return $this->returnErrorData('กรุณาระบุสิทธิ์ผู้ใช้งานให้เรียบร้อย', 404);
        }

        $permission = Permission::find($permissionId);
        if (!$permission) {
            return $this->returnErrorData('ไม่พบสิทธิ์ผู้ใช้งานที่ต้องการแก้ไข', 404);
        }

        $item = User::find($id);
        if (!$item) {
            return $this->returnErrorData('ไม่พบผู้ใช้งานที่ต้องการแก้ไข', 404);
        }

        DB::beginTransaction();
        try {
            $oldPermission = Permission::find($item->permission_id);
            $item->permission_id = (int) $permissionId;
            $item->save();

            if ((int) ($oldPermission->id ?? 0) !== (int) $permissionId) {
                $actorId = $this->resolveActorId($request);
                $description = 'User ' . $actorId . ' changed permission for user ' . $item->username . ' from '
                    . ($oldPermission->name ?? '-') . ' to ' . $permission->name;
                $this->Log($actorId, $description, 'Update User Permission');
            }

            DB::commit();
            return $this->returnSuccess('อัปเดตสิทธิ์ผู้ใช้งานสำเร็จ', $item);
        } catch (\Throwable $e) {
            DB::rollback();
            return $this->returnErrorData('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง ' . $e->getMessage(), 500);
        }
    }

    public function getProfileUser(Request $request)
    {

        $Item = User::where('id', $request->login_id)
            ->first();

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $Item);
    }

    public function updateProfileUser(Request $request)
    {
        $loginBy = $request->login_by;

        if (! isset($loginBy)) {
            return $this->returnErrorData('ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่อีกครั้ง', 404);
        }

        $check = Permission::find($request->permission_id)->first();
        if ($check) {
            return $this->returnErrorData('ไม่พบสิทธิ์นี้ในระบบอยู่แล้ว', 404);
        }

        DB::beginTransaction();

        try {

            $Item = User::find($loginBy->id);

            $Item->name          = $request->name;
            $Item->email         = $request->email;
            $Item->phone         = $request->phone;
            $Item->permission_id = $request->permission_id;

            $Item->update_by  = $loginBy->username;
            $Item->updated_at = Carbon::now()->toDateTimeString();

            $Item->save();

            DB::commit();

            return $this->returnUpdate('ดำเนินการสำเร็จ');
        } catch (\Throwable $e) {

            DB::rollback();

            return $this->returnErrorData('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง ', 404);
        }
    }

    /**
     * Remove the specified resource from storage.
     *
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */
    public function destroy(Request $request, $id)
    {
        // $loginBy = $request->login_by;

        // if (!isset($loginBy)) {
        //     return $this->returnErrorData('ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่อีกครั้ง', 404);
        // }

        DB::beginTransaction();

        try {

            $Item = User::find($id);

            $Item->username = $Item->username . '_del_' . date('YmdHis');
            $Item->save();

            //log
            $actorId     = $this->resolveActorId($request);
            $type        = 'Delete User';
            $description = 'User ' . $actorId . ' deleted user ' . $Item->username;
            $this->Log($actorId, $description, $type);
            //

            $Item->delete();

            DB::commit();

            return $this->returnUpdate('ดำเนินการสำเร็จ');
        } catch (\Throwable $e) {

            DB::rollback();

            return $this->returnErrorData('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง ', 404);
        }
    }

    private function deletedUserForCreate(Request $request): ?User
    {
        $code = trim((string) ($request->code ?? ''));
        $username = trim((string) ($request->username ?? ''));

        if ($code === '' && $username === '') {
            return null;
        }

        return User::onlyTrashed()
            ->where(function ($query) use ($code, $username) {
                if ($code !== '') {
                    $query->orWhere('code', $code);
                }
                if ($username !== '') {
                    $query->orWhere('username', $username);
                }
            })
            ->orderByDesc('id')
            ->first();
    }

    private function fillCreatedUser(User $user, Request $request, string $type): void
    {
        $user->permission_id = $request->permission_id;
        if ($request->exists('code')) {
            $user->code      = $request->code;
        }
        $user->username      = $request->username;
        $user->name          = $request->name;
        $user->email         = $request->email;
        $user->phone         = $request->phone;
        $user->type          = $type;
    }

    public function createUserAdmin(Request $request)
    {
        if (! isset($request->username)) {
            return $this->returnErrorData('[username] ไม่มีข้อมูล', 404);
        } else if (! isset($request->name)) {
            return $this->returnErrorData('[fname] ไม่มีข้อมูล', 404);
        } else if (! isset($request->password)) {
            return $this->returnErrorData('[password] ไม่มีข้อมูล', 404);
        }

        $checkName = User::where(function ($query) use ($request) {
            $query->orwhere('email', $request->email)
                ->orWhere('username', $request->username);
        })
            ->first();

        if ($checkName) {
            return $this->returnErrorData('มีผู้ใช้งานนี้ในระบบแล้ว', 404);
        }

        if (!empty($request->code)) {
            $checkCode = User::where('code', $request->code)->first();
            if ($checkCode) {
                return $this->returnErrorData('มีรหัสพนักงาน ' . $request->code . ' ในระบบแล้ว', 404);
            }
        }

        DB::beginTransaction();

        try {

            //
            $Item = $this->deletedUserForCreate($request) ?: new User();
            $wasTrashed = $Item->exists && $Item->trashed();

            $this->fillCreatedUser($Item, $request, $Item->type ?: 'local');
            $Item->password  = md5($request->password);
            $Item->status    = "Yes";
            $Item->create_by = "admin";

            if ($wasTrashed) {
                $Item->restore();
            } else {
                $Item->save();
            }

            //log
            $actorId     = $this->resolveActorId($request);
            $type        = 'Create Admin User';
            $description = 'User ' . $actorId . ' created admin user ' . $request->username;
            $this->Log($actorId, $description, $type);
            //

            DB::commit();

            return $this->returnSuccess('ดำเนินการสำเร็จ', []);
        } catch (\Throwable $e) {

            DB::rollback();

            return $this->returnErrorData('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง ' . $e, 404);
        }
    }

    public function ResetPasswordUser(Request $request, $id)
    {
        $loginBy = $request->login_by;

        if (! isset($id)) {
            return $this->returnErrorData('ไม่พบข้อมูล id', 404);
        } else if (! isset($request->password)) {
            return $this->returnErrorData('กรุณาระบุรหัสผ่านให้เรียบร้อย', 404);
        } else if (! isset($request->new_password)) {
            return $this->returnErrorData('กรุณาระบุรหัสผ่านใหม่ให้เรียบร้อย', 404);
        } else if (! isset($request->confirm_new_password)) {
            return $this->returnErrorData('กรุณาระบุรหัสผ่านใหม่อีกครั้ง', 404);
        } else if (! isset($loginBy)) {
            return $this->returnErrorData('ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่อีกครั้ง', 404);
        }

        if (strlen($request->new_password) < 6) {
            return $this->returnErrorData('กรุณาระบุรหัสผ่านอย่างน้อย 6 หลัก', 404);
        }

        if ($request->new_password != $request->confirm_new_password) {
            return $this->returnErrorData('รหัสผ่านไม่ตรงกัน', 404);
        }

        DB::beginTransaction();

        try {

            $Item = User::find($id);

            if ($Item->password == md5($request->password)) {

                $Item->password   = md5($request->new_password);
                $Item->updated_at = Carbon::now()->toDateTimeString();
                $Item->save();

                DB::commit();

                return $this->returnUpdate('ดำเนินการสำเร็จ');
            } else {

                return $this->returnErrorData('รหัสผ่านไม่ถูกต้อง', 404);
            }
        } catch (\Throwable $e) {

            DB::rollback();

            return $this->returnErrorData('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง ', 404);
        }
    }

    public function ForgotPasswordUser(Request $request)
    {

        $email = $request->email;

        $Item = User::where('email', $email)->where('status', 'Yes')->first();

        if (! empty($Item)) {

            //random string
            $length           = 8;
            $characters       = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
            $charactersLength = strlen($characters);
            $randomString     = '';
            for ($i = 0; $i < $length; $i++) {
                $randomString .= $characters[rand(0, $charactersLength - 1)];
            }
            //

            $newPasword = md5($randomString);

            DB::beginTransaction();

            try {

                $Item->password = $newPasword;
                $Item->save();

                $title = 'รหัสผ่านใหม่';
                $text  = 'รหัสผ่านใหม่ของคุณคือ  ' . $randomString;
                $type  = 'Forgot Password';

                // //send line
                // if ($Item->line_token) {
                //     $this->sendLine($Item->line_token, $text);
                // }

                //send email
                if ($Item->email) {
                    $this->sendMail($Item->email, $text, $title, $type);
                }

                DB::commit();

                return $this->returnUpdate('ดำเนินการสำเร็จ');
            } catch (\Throwable $e) {

                DB::rollback();

                return $this->returnErrorData('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง ', 404);
            }
        } else {
            return $this->returnErrorData('ไม่พบอีเมล์ในระบบ ', 404);
        }
    }

}

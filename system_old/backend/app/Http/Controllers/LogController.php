<?php

namespace App\Http\Controllers;

use Carbon\Carbon;
use App\Models\Log;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class LogController extends Controller
{
    public function getPage(Request $request)
    {
        if (!$this->isSystemAdminRequest($request)) {
            return $this->auditLogForbiddenResponse();
        }

        $length = max((int) $request->input('length', 25), 1);
        $start = max((int) $request->input('start', 0), 0);
        $page = (int) floor($start / $length) + 1;
        $searchValue = trim((string) $request->input('search.value', ''));

        $orderby = [
            'log.id',
            'actor_name',
            'log.type',
            'log.description',
            'log.created_at',
        ];

        $driver = DB::connection()->getDriverName();
        $userIdJoinColumn = $driver === 'pgsql'
            ? DB::raw('CAST(actor_users.id AS TEXT)')
            : DB::raw('CAST(actor_users.id AS CHAR)');

        $query = DB::table('log')
            ->leftJoin('users as actor_users', function ($join) use ($userIdJoinColumn) {
                $join->on($userIdJoinColumn, '=', 'log.user_id')
                    ->orOn('actor_users.code', '=', 'log.user_id')
                    ->orOn('actor_users.username', '=', 'log.user_id');
            })
            ->leftJoin('employees as actor_employees', function ($join) {
                $join->on('actor_employees.code', '=', 'actor_users.code')
                    ->orOn('actor_employees.code', '=', 'log.user_id');
            })
            ->whereNull('log.deleted_at')
            ->select([
                'log.id',
                'log.user_id',
                'log.description',
                'log.type',
                'log.created_at',
                'log.updated_at',
                'actor_users.code as actor_code',
                'actor_users.username as actor_username',
                'actor_users.name as actor_user_name',
                'actor_users.email as actor_email',
                'actor_employees.initial as actor_initial',
                'actor_employees.firstname as actor_firstname',
                'actor_employees.lastname as actor_lastname',
                'actor_employees.department_name as actor_department_name',
                DB::raw("COALESCE(NULLIF(actor_users.name, ''), NULLIF(CONCAT_WS(' ', actor_employees.firstname, actor_employees.lastname), ''), NULLIF(actor_users.username, ''), log.user_id) as actor_name"),
            ]);

        if ($request->filled('type')) {
            $query->where('log.type', trim((string) $request->input('type')));
        }

        if ($dateFrom = $this->parseLogDate($request->input('date_from'), 'start')) {
            $query->where('log.created_at', '>=', $dateFrom);
        }

        if ($dateTo = $this->parseLogDate($request->input('date_to'), 'end')) {
            $query->where('log.created_at', '<=', $dateTo);
        }

        if ($searchValue !== '') {
            $query->where(function ($q) use ($searchValue) {
                $like = '%' . $searchValue . '%';
                $q->orWhere('log.user_id', 'like', $like)
                    ->orWhere('log.description', 'like', $like)
                    ->orWhere('log.type', 'like', $like)
                    ->orWhere('actor_users.code', 'like', $like)
                    ->orWhere('actor_users.username', 'like', $like)
                    ->orWhere('actor_users.name', 'like', $like)
                    ->orWhere('actor_users.email', 'like', $like)
                    ->orWhere('actor_employees.initial', 'like', $like)
                    ->orWhere('actor_employees.firstname', 'like', $like)
                    ->orWhere('actor_employees.lastname', 'like', $like)
                    ->orWhere('actor_employees.department_name', 'like', $like);
            });
        }

        $orderColumn = (int) $request->input('order.0.column', 4);
        $orderDir = strtolower((string) $request->input('order.0.dir', 'desc')) === 'asc' ? 'asc' : 'desc';

        if (!empty($orderby[$orderColumn])) {
            $query->orderBy($orderby[$orderColumn], $orderDir);
        } else {
            $query->orderBy('log.created_at', 'desc')->orderBy('log.id', 'desc');
        }

        $logs = $query->paginate($length, ['*'], 'page', $page);

        if ($logs->isNotEmpty()) {
            $no = (($page - 1) * $length);
            foreach ($logs as $log) {
                $no++;
                $log->No = $no;
            }
        }

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $logs);
    }

    public function getTypes(Request $request)
    {
        if (!$this->isSystemAdminRequest($request)) {
            return $this->auditLogForbiddenResponse();
        }

        $types = Log::query()
            ->whereNull('deleted_at')
            ->whereNotNull('type')
            ->where('type', '<>', '')
            ->distinct()
            ->orderBy('type')
            ->pluck('type')
            ->values();

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $types);
    }

    private function parseLogDate($value, $boundary)
    {
        if (!$value) {
            return null;
        }

        try {
            $date = Carbon::parse($value);
            return $boundary === 'end'
                ? $date->endOfDay()->format('Y-m-d H:i:s')
                : $date->startOfDay()->format('Y-m-d H:i:s');
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function auditLogForbiddenResponse()
    {
        return response()->json([
            'code' => '403',
            'status' => false,
            'message' => 'Audit Log is restricted to the system admin account only',
            'data' => [],
        ], 403);
    }

}

<?php

namespace App\Http\Controllers;

use App\Services\CurrentProjectImportService;
use Illuminate\Http\Request;

class CurrentProjectImportController extends Controller
{
    public function import(Request $request, CurrentProjectImportService $service)
    {
        if (! $request->hasFile('file')) {
            return response()->json([
                'code' => '422',
                'status' => false,
                'message' => 'กรุณาแนบไฟล์ Excel ใน field file',
                'data' => [],
            ], 422);
        }

        $file = $request->file('file');
        if (! $file->isValid()) {
            return response()->json([
                'code' => '422',
                'status' => false,
                'message' => 'ไฟล์อัปโหลดไม่สมบูรณ์',
                'data' => [],
            ], 422);
        }

        $extension = strtolower((string) $file->getClientOriginalExtension());
        if (! in_array($extension, ['xlsx', 'xls'], true)) {
            return response()->json([
                'code' => '422',
                'status' => false,
                'message' => 'รองรับเฉพาะไฟล์ .xlsx หรือ .xls',
                'data' => [],
            ], 422);
        }

        $commit = filter_var($request->input('commit', false), FILTER_VALIDATE_BOOLEAN);
        $actorId = $this->resolveActorId($request);

        try {
            $result = $service->previewOrImport($file, $commit, $actorId);
        } catch (\InvalidArgumentException $e) {
            return response()->json([
                'code' => '422',
                'status' => false,
                'message' => $e->getMessage(),
                'data' => [],
            ], 422);
        } catch (\Throwable $e) {
            return response()->json([
                'code' => '500',
                'status' => false,
                'message' => $e->getMessage(),
                'data' => [],
            ], 500);
        }

        if (! empty($result['errors'])) {
            return response()->json([
                'code' => '422',
                'status' => false,
                'message' => 'ตรวจสอบไฟล์ไม่ผ่าน',
                'data' => $result,
            ], 422);
        }

        return response()->json([
            'code' => $commit ? '201' : '200',
            'status' => true,
            'message' => $commit ? 'นำเข้าข้อมูลสำเร็จ' : 'ตรวจสอบไฟล์สำเร็จ ยังไม่ได้บันทึกข้อมูล',
            'data' => $result,
        ], $commit ? 201 : 200);
    }
}

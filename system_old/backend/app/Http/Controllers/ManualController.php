<?php

namespace App\Http\Controllers;

use App\Models\Manual;
use App\Models\ManualPageMapping;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class ManualController extends Controller
{
    private const MANUAL_ALLOWED_MIMES = 'pdf,jpg,jpeg,png,mp4,webm,mov';
    private const MANUAL_MAX_UPLOAD_KB = 204800;

    private $allowedMatchTypes = ['exact', 'prefix', 'pattern'];

    public function getPage(Request $request)
    {
        $length = (int) ($request->length ?? 10);
        $start = (int) ($request->start ?? 0);
        $length = $length > 0 ? $length : 10;
        $page = (int) floor($start / $length) + 1;

        $query = Manual::with(['mappings.menu'])->select('manuals.*');

        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('status', $request->status);
        }

        $search = $request->search;
        $searchValue = is_array($search) ? ($search['value'] ?? '') : '';
        if ($searchValue !== '') {
            $query->where(function ($q) use ($searchValue) {
                $q->where('title', 'like', '%' . $searchValue . '%')
                    ->orWhere('description', 'like', '%' . $searchValue . '%')
                    ->orWhere('original_file_name', 'like', '%' . $searchValue . '%')
                    ->orWhereHas('mappings', function ($mappingQuery) use ($searchValue) {
                        $mappingQuery->where('url_path', 'like', '%' . $searchValue . '%')
                            ->orWhere('normalized_path', 'like', '%' . $searchValue . '%');
                    });
            });
        }

        $order = $request->order;
        $orderColumns = [
            '',
            'title',
            'original_file_name',
            'status',
            'updated_at',
        ];

        if (is_array($order)) {
            $orderColumn = (int) data_get($order, '0.column', 4);
            $orderDir = strtolower((string) data_get($order, '0.dir', 'desc')) === 'asc' ? 'asc' : 'desc';
            if (!empty($orderColumns[$orderColumn])) {
                $query->orderBy($orderColumns[$orderColumn], $orderDir);
            } else {
                $query->orderBy('updated_at', 'desc');
            }
        } else {
            $query->orderBy('updated_at', 'desc');
        }

        $items = $query->paginate($length, ['*'], 'page', $page);
        $no = (($page - 1) * $length);
        $collection = $items->getCollection()->map(function ($manual) use (&$no) {
            $row = $this->serializeManual($manual);
            $row['No'] = ++$no;
            return $row;
        });
        $items->setCollection($collection);

        return $this->returnSuccess('เรียกดูข้อมูลสำเร็จ', $items);
    }

    public function index(Request $request)
    {
        $query = Manual::with(['mappings.menu'])->orderBy('updated_at', 'desc');

        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('status', $request->status);
        }

        return $this->returnSuccess('Successful', $query->get()->map(function ($manual) {
            return $this->serializeManual($manual);
        }));
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'status' => 'nullable|in:active,inactive',
            'file' => 'required|file|mimes:' .
                self::MANUAL_ALLOWED_MIMES .
                '|max:' .
                self::MANUAL_MAX_UPLOAD_KB,
        ]);

        if ($validator->fails()) {
            return $this->errorResponse($validator->errors()->first(), 422);
        }

        try {
            $mappings = $this->parseMappings($request);
        } catch (\InvalidArgumentException $e) {
            return $this->errorResponse($e->getMessage(), 422);
        }

        $actorId = $this->resolveActorId($request);
        $storedFile = $this->storeManualFile($request->file('file'));

        DB::beginTransaction();
        try {
            $manual = Manual::create([
                'title' => $request->title,
                'description' => $request->description,
                'original_file_name' => $storedFile['original_file_name'],
                'stored_file_name' => $storedFile['stored_file_name'],
                'file_path' => $storedFile['file_path'],
                'mime_type' => $storedFile['mime_type'],
                'file_extension' => $storedFile['file_extension'],
                'file_size' => $storedFile['file_size'],
                'status' => $request->status ?: 'active',
                'uploaded_by' => $actorId,
                'create_by' => $actorId,
                'update_by' => $actorId,
            ]);

            $this->syncMappings($manual, $mappings, $actorId);

            $this->Log($actorId, 'User ' . $actorId . ' has Create Manual #' . $manual->id, 'Create Manual');

            DB::commit();

            $manual->load(['mappings.menu']);
            return $this->returnSuccess('ดำเนินการสำเร็จ', $this->serializeManual($manual));
        } catch (\Throwable $e) {
            DB::rollBack();
            Storage::disk('local')->delete($storedFile['file_path']);
            return $this->errorResponse('Something went wrong Please try again', 500);
        }
    }

    public function show($id)
    {
        $manual = Manual::with(['mappings.menu'])->find($id);
        if (!$manual) {
            return $this->errorResponse('Manual not found', 404);
        }

        return $this->returnSuccess('Successful', $this->serializeManual($manual));
    }

    public function update(Request $request, $id)
    {
        $manual = Manual::with(['mappings.menu'])->find($id);
        if (!$manual) {
            return $this->errorResponse('Manual not found', 404);
        }

        $validator = Validator::make($request->all(), [
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'status' => 'nullable|in:active,inactive',
            'file' => 'nullable|file|mimes:' .
                self::MANUAL_ALLOWED_MIMES .
                '|max:' .
                self::MANUAL_MAX_UPLOAD_KB,
        ]);

        if ($validator->fails()) {
            return $this->errorResponse($validator->errors()->first(), 422);
        }

        try {
            $mappings = $this->parseMappings($request);
        } catch (\InvalidArgumentException $e) {
            return $this->errorResponse($e->getMessage(), 422);
        }

        $actorId = $this->resolveActorId($request);
        $storedFile = null;
        $oldFilePath = $manual->file_path;

        if ($request->hasFile('file')) {
            $storedFile = $this->storeManualFile($request->file('file'));
        }

        DB::beginTransaction();
        try {
            $manual->title = $request->title;
            $manual->description = $request->description;
            $manual->status = $request->status ?: 'active';
            $manual->update_by = $actorId;

            if ($storedFile) {
                $manual->original_file_name = $storedFile['original_file_name'];
                $manual->stored_file_name = $storedFile['stored_file_name'];
                $manual->file_path = $storedFile['file_path'];
                $manual->mime_type = $storedFile['mime_type'];
                $manual->file_extension = $storedFile['file_extension'];
                $manual->file_size = $storedFile['file_size'];
                $manual->uploaded_by = $actorId;
            }

            $manual->save();
            $this->syncMappings($manual, $mappings, $actorId);

            $this->Log($actorId, 'User ' . $actorId . ' has Update Manual #' . $manual->id, 'Update Manual');

            DB::commit();

            if ($storedFile && $oldFilePath && $oldFilePath !== $storedFile['file_path']) {
                Storage::disk('local')->delete($oldFilePath);
            }

            $manual->load(['mappings.menu']);
            return $this->returnSuccess('ดำเนินการสำเร็จ', $this->serializeManual($manual));
        } catch (\Throwable $e) {
            DB::rollBack();
            if ($storedFile) {
                Storage::disk('local')->delete($storedFile['file_path']);
            }
            return $this->errorResponse('Something went wrong Please try again', 500);
        }
    }

    public function destroy(Request $request, $id)
    {
        $manual = Manual::find($id);
        if (!$manual) {
            return $this->errorResponse('Manual not found', 404);
        }

        $actorId = $this->resolveActorId($request);

        DB::beginTransaction();
        try {
            $manual->mappings()->delete();
            $manual->delete();

            $this->Log($actorId, 'User ' . $actorId . ' has Delete Manual #' . $id, 'Delete Manual');

            DB::commit();
            return $this->returnSuccess('ดำเนินการสำเร็จ', []);
        } catch (\Throwable $e) {
            DB::rollBack();
            return $this->errorResponse('Something went wrong Please try again', 500);
        }
    }

    public function byPath(Request $request)
    {
        $path = $this->normalizePath($request->query('path', $request->path));
        if ($path === '') {
            return $this->returnSuccess('Successful', []);
        }

        $mappings = ManualPageMapping::with(['manual.mappings.menu'])
            ->where('is_active', 1)
            ->whereHas('manual', function ($query) {
                $query->where('status', 'active');
            })
            ->orderBy('display_order')
            ->orderBy('id')
            ->get();

        $matched = [];
        foreach ($mappings as $mapping) {
            $priority = $this->matchPriority($mapping, $path);
            if ($priority === null || !$mapping->manual) {
                continue;
            }

            $matched[] = [
                'priority' => $priority,
                'display_order' => (int) $mapping->display_order,
                'mapping_id' => (int) $mapping->id,
                'manual' => $mapping->manual,
            ];
        }

        usort($matched, function ($a, $b) {
            if ($a['priority'] !== $b['priority']) {
                return $a['priority'] < $b['priority'] ? -1 : 1;
            }
            if ($a['display_order'] !== $b['display_order']) {
                return $a['display_order'] < $b['display_order'] ? -1 : 1;
            }
            return $a['mapping_id'] < $b['mapping_id'] ? -1 : 1;
        });

        $seen = [];
        $manuals = [];
        foreach ($matched as $item) {
            $manual = $item['manual'];
            if (isset($seen[(int) $manual->id])) {
                continue;
            }
            $seen[(int) $manual->id] = true;
            $manuals[] = $this->serializeManual($manual);
        }

        return $this->returnSuccess('Successful', $manuals);
    }

    public function file(Request $request, $id)
    {
        $manual = Manual::find($id);
        if (!$manual) {
            return $this->errorResponse('Manual not found', 404);
        }

        if (!$manual->file_path || !Storage::disk('local')->exists($manual->file_path)) {
            return $this->errorResponse('Manual file not found', 404);
        }

        $absolutePath = storage_path('app/' . ltrim($manual->file_path, '/'));
        $fileName = $manual->original_file_name ?: $manual->stored_file_name ?: basename($absolutePath);
        $mimeType = $manual->mime_type ?: File::mimeType($absolutePath) ?: 'application/octet-stream';
        $mediaType = $this->getManualMediaType($mimeType, $manual->file_extension, $fileName);
        $headers = [
            'Content-Type' => $mimeType,
            'Content-Disposition' => $this->inlineContentDisposition($fileName),
        ];

        if ($mediaType === 'video') {
            $headers['Accept-Ranges'] = 'bytes';

            if ($request->headers->has('Range')) {
                return $this->rangeFileResponse($request, $absolutePath, $fileName, $mimeType);
            }
        }

        return response()->file($absolutePath, $headers);
    }

    private function parseMappings(Request $request)
    {
        $raw = $request->input('mappings');
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new \InvalidArgumentException('Invalid mappings payload');
            }
            $raw = $decoded;
        }

        if (!is_array($raw) || empty($raw)) {
            throw new \InvalidArgumentException('Please add at least one URL path');
        }

        $rows = [];
        foreach ($raw as $index => $mapping) {
            if (!is_array($mapping)) {
                continue;
            }

            $path = $this->normalizePath(data_get($mapping, 'url_path', ''));
            if ($path === '') {
                continue;
            }

            if (strlen($path) > 500) {
                throw new \InvalidArgumentException('URL path is too long');
            }

            $matchType = data_get($mapping, 'match_type', 'exact') ?: 'exact';
            if (!in_array($matchType, $this->allowedMatchTypes, true)) {
                throw new \InvalidArgumentException('Invalid match type');
            }

            $menuId = data_get($mapping, 'menu_id');
            if ($menuId === '' || $menuId === 'null') {
                $menuId = null;
            }
            if ($menuId !== null && !is_numeric($menuId)) {
                throw new \InvalidArgumentException('Invalid menu mapping');
            }

            $isActive = data_get($mapping, 'is_active', 1);
            $rows[] = [
                'menu_id' => $menuId === null ? null : (int) $menuId,
                'url_path' => $path,
                'normalized_path' => $path,
                'match_type' => $matchType,
                'display_order' => (int) (data_get($mapping, 'display_order', count($rows) + 1) ?: count($rows) + 1),
                'is_active' => ($isActive === false || $isActive === 0 || $isActive === '0') ? 0 : 1,
            ];
        }

        if (empty($rows)) {
            throw new \InvalidArgumentException('Please add at least one URL path');
        }

        return $rows;
    }

    private function syncMappings(Manual $manual, array $mappings, $actorId)
    {
        $manual->mappings()->delete();

        $rows = [];
        foreach ($mappings as $mapping) {
            $rows[] = array_merge($mapping, [
                'manual_id' => $manual->id,
                'create_by' => $actorId,
                'update_by' => $actorId,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        if (!empty($rows)) {
            DB::table('manual_page_mappings')->insert($rows);
        }
    }

    private function storeManualFile($file)
    {
        $extension = strtolower($file->getClientOriginalExtension());
        $storedFileName = (string) Str::uuid() . '.' . $extension;
        $directory = 'manuals/' . date('Y') . '/' . date('m');
        $path = $file->storeAs($directory, $storedFileName, 'local');

        return [
            'original_file_name' => $file->getClientOriginalName(),
            'stored_file_name' => $storedFileName,
            'file_path' => $path,
            'mime_type' => $file->getMimeType(),
            'file_extension' => $extension,
            'file_size' => $file->getSize(),
        ];
    }

    private function serializeManual(Manual $manual)
    {
        $mappings = [];
        $manualMappings = $manual->relationLoaded('mappings') ? $manual->mappings : $manual->mappings()->with('menu')->get();
        foreach ($manualMappings as $mapping) {
            $menu = $mapping->relationLoaded('menu') ? $mapping->menu : null;
            $mappings[] = [
                'id' => (int) $mapping->id,
                'manual_id' => (int) $mapping->manual_id,
                'menu_id' => $mapping->menu_id === null ? null : (int) $mapping->menu_id,
                'menu_name' => $menu ? $menu->name : null,
                'menu_key' => $menu ? $menu->key : null,
                'menu_path' => $menu ? $menu->path : null,
                'url_path' => $mapping->url_path,
                'normalized_path' => $mapping->normalized_path,
                'match_type' => $mapping->match_type,
                'display_order' => (int) $mapping->display_order,
                'is_active' => (int) $mapping->is_active,
            ];
        }

        return [
            'id' => (int) $manual->id,
            'title' => $manual->title,
            'description' => $manual->description,
            'original_file_name' => $manual->original_file_name,
            'file_path' => '/api/manuals/' . $manual->id . '/file',
            'mime_type' => $manual->mime_type,
            'file_extension' => $manual->file_extension,
            'file_size' => $manual->file_size === null ? null : (int) $manual->file_size,
            'media_type' => $this->getManualMediaType(
                $manual->mime_type,
                $manual->file_extension,
                $manual->original_file_name
            ),
            'status' => $manual->status,
            'created_at' => $manual->created_at ? $manual->created_at->toDateTimeString() : null,
            'updated_at' => $manual->updated_at ? $manual->updated_at->toDateTimeString() : null,
            'mappings' => $mappings,
        ];
    }

    private function getManualMediaType($mimeType, $extension = null, $fileName = null)
    {
        $type = strtolower((string) $mimeType);
        $extension = strtolower((string) $extension);
        $fileName = strtolower((string) $fileName);

        if (strpos($type, 'pdf') !== false || $extension === 'pdf' || Str::endsWith($fileName, '.pdf')) {
            return 'pdf';
        }

        if (
            strpos($type, 'image/') === 0 ||
            in_array($extension, ['jpg', 'jpeg', 'png'], true) ||
            Str::endsWith($fileName, ['.jpg', '.jpeg', '.png'])
        ) {
            return 'image';
        }

        if (
            strpos($type, 'video/') === 0 ||
            in_array($extension, ['mp4', 'webm', 'mov'], true) ||
            Str::endsWith($fileName, ['.mp4', '.webm', '.mov'])
        ) {
            return 'video';
        }

        return 'unsupported';
    }

    private function rangeFileResponse(Request $request, $absolutePath, $fileName, $mimeType)
    {
        $fileSize = File::size($absolutePath);
        $range = (string) $request->headers->get('Range', '');

        if (!preg_match('/bytes=(\d*)-(\d*)/', $range, $matches)) {
            return response('', 416, [
                'Content-Range' => 'bytes */' . $fileSize,
                'Accept-Ranges' => 'bytes',
            ]);
        }

        $start = $matches[1] === '' ? null : (int) $matches[1];
        $end = $matches[2] === '' ? null : (int) $matches[2];

        if ($start === null && $end !== null) {
            $suffixLength = min($end, $fileSize);
            $start = $fileSize - $suffixLength;
            $end = $fileSize - 1;
        } else {
            $start = $start === null ? 0 : $start;
            $end = $end === null ? $fileSize - 1 : min($end, $fileSize - 1);
        }

        if ($start < 0 || $start > $end || $start >= $fileSize) {
            return response('', 416, [
                'Content-Range' => 'bytes */' . $fileSize,
                'Accept-Ranges' => 'bytes',
            ]);
        }

        $length = $end - $start + 1;
        $headers = [
            'Content-Type' => $mimeType,
            'Content-Length' => $length,
            'Content-Range' => 'bytes ' . $start . '-' . $end . '/' . $fileSize,
            'Accept-Ranges' => 'bytes',
            'Content-Disposition' => $this->inlineContentDisposition($fileName),
        ];

        return response()->stream(function () use ($absolutePath, $start, $length) {
            $handle = fopen($absolutePath, 'rb');
            if ($handle === false) {
                return;
            }

            fseek($handle, $start);
            $remaining = $length;

            while ($remaining > 0 && !feof($handle)) {
                $chunkSize = min(8192, $remaining);
                $buffer = fread($handle, $chunkSize);
                if ($buffer === false || $buffer === '') {
                    break;
                }

                echo $buffer;
                $remaining -= strlen($buffer);
                flush();
            }

            fclose($handle);
        }, 206, $headers);
    }

    private function normalizePath($path)
    {
        $path = trim((string) $path);
        if ($path === '') {
            return '';
        }

        $path = explode('#', $path, 2)[0];
        $path = explode('?', $path, 2)[0];
        $path = trim($path);
        if ($path === '') {
            return '';
        }

        if (strpos($path, '/') !== 0) {
            $path = '/' . $path;
        }

        $path = preg_replace('#/+#', '/', $path);
        if (strlen($path) > 1) {
            $path = rtrim($path, '/');
        }

        return $path === '' ? '/' : $path;
    }

    private function matchPriority(ManualPageMapping $mapping, $path)
    {
        $mappingPath = $this->normalizePath($mapping->normalized_path ?: $mapping->url_path);
        if ($mappingPath === '') {
            return null;
        }

        if ($mapping->match_type === 'exact' && $mappingPath === $path) {
            return 1;
        }

        if ($mapping->match_type === 'prefix' && $this->pathMatchesPrefix($mappingPath, $path)) {
            return 2;
        }

        if ($mapping->match_type === 'pattern' && $this->pathMatchesPattern($mappingPath, $path)) {
            return 3;
        }

        return null;
    }

    private function pathMatchesPrefix($prefix, $path)
    {
        if ($prefix === '/') {
            return true;
        }

        return $path === $prefix || strpos($path, $prefix . '/') === 0;
    }

    private function pathMatchesPattern($pattern, $path)
    {
        $patternSegments = trim($pattern, '/') === '' ? [] : explode('/', trim($pattern, '/'));
        $pathSegments = trim($path, '/') === '' ? [] : explode('/', trim($path, '/'));

        if (count($patternSegments) !== count($pathSegments)) {
            return false;
        }

        foreach ($patternSegments as $index => $segment) {
            if ($segment === '*') {
                continue;
            }

            if (strpos($segment, ':') === 0 && strlen($segment) > 1) {
                if ($pathSegments[$index] === '') {
                    return false;
                }
                continue;
            }

            if ($segment !== $pathSegments[$index]) {
                return false;
            }
        }

        return true;
    }

    private function inlineContentDisposition($fileName)
    {
        $safeName = str_replace('"', '', basename((string) $fileName));
        $asciiName = preg_replace('/[^\x20-\x7E]/', '_', $safeName);
        if ($asciiName === '') {
            $asciiName = 'manual';
        }

        return 'inline; filename="' . $asciiName . '"; filename*=UTF-8\'\'' . rawurlencode($safeName);
    }

    private function errorResponse($message, $statusCode)
    {
        return response()->json([
            'code' => (string) $statusCode,
            'status' => false,
            'message' => $message,
            'data' => [],
        ], $statusCode);
    }
}

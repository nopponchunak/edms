<?php

namespace App\Http\Controllers;

use App\Services\LegacyDesignReviewService;
use App\Services\LegacyDesignReviewMigrationService;
use Illuminate\Http\Request;
use Throwable;

class LegacyDesignReviewController extends Controller
{
    private LegacyDesignReviewService $legacyDesignReview;
    private LegacyDesignReviewMigrationService $migrationService;

    public function __construct(
        LegacyDesignReviewService $legacyDesignReview,
        LegacyDesignReviewMigrationService $migrationService
    )
    {
        $this->legacyDesignReview = $legacyDesignReview;
        $this->migrationService = $migrationService;
    }

    public function health()
    {
        return $this->handle(fn () => $this->legacyDesignReview->health());
    }

    public function stages()
    {
        return $this->returnSuccess('success', [
            'stages' => $this->legacyDesignReview->stages(),
            'counts' => $this->legacyDesignReview->stageCounts(),
        ]);
    }

    public function migrationSummary()
    {
        return $this->handle(fn () => $this->migrationService->summary());
    }

    public function completedRecordTypes()
    {
        return $this->handle(fn () => $this->migrationService->completedRecordTypes());
    }

    public function completedRecordsPage(Request $request)
    {
        return $this->handle(fn () => $this->migrationService->completedRecordsPage($request));
    }

    public function sync(Request $request)
    {
        return $this->handle(fn () => $this->migrationService->sync($request->all()));
    }

    public function mapUsers(Request $request)
    {
        return $this->handle(fn () => $this->migrationService->mapUsers($request->all()));
    }

    public function generate(Request $request)
    {
        return $this->handle(fn () => $this->migrationService->generate($request->all()));
    }

    public function stageSummary(Request $request, string $stage)
    {
        return $this->handle(function () use ($request, $stage) {
            $limit = (int) $request->query('limit', 300);
            $search = $request->query('search');
            $status = $request->query('status', 'active');

            return $this->legacyDesignReview->stageSummary(
                $stage,
                $limit,
                is_string($search) ? $search : null,
                is_string($status) ? $status : 'active'
            );
        });
    }

    public function peerReviewDetail(int $id)
    {
        return $this->handle(function () use ($id) {
            $detail = $this->legacyDesignReview->peerReviewDetail($id);

            if (! $detail) {
                return response()->json([
                    'code' => '404',
                    'status' => false,
                    'message' => 'ไม่พบข้อมูล',
                    'data' => [],
                ], 404);
            }

            return $detail;
        });
    }

    public function peerReviewActions(int $id)
    {
        return $this->handle(fn () => $this->legacyDesignReview->peerReviewActions($id));
    }

    public function itemDetail(string $stage, int $id)
    {
        return $this->handle(function () use ($stage, $id) {
            $detail = $this->legacyDesignReview->itemDetail($stage, $id);

            if (! $detail) {
                return response()->json([
                    'code' => '404',
                    'status' => false,
                    'message' => 'ไม่พบข้อมูล',
                    'data' => [],
                ], 404);
            }

            return $detail;
        });
    }

    public function itemActions(string $stage, int $id)
    {
        return $this->handle(fn () => $this->legacyDesignReview->itemActions($stage, $id));
    }

    private function handle(callable $callback)
    {
        try {
            $result = $callback();

            if ($result instanceof \Illuminate\Http\JsonResponse) {
                return $result;
            }

            return $this->returnSuccess('success', $result);
        } catch (Throwable $e) {
            return response()->json([
                'code' => '500',
                'status' => false,
                'message' => $e->getMessage(),
                'data' => [],
            ], 500);
        }
    }
}

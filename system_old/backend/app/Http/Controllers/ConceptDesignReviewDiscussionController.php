<?php

namespace App\Http\Controllers;

use App\Models\ConceptDesignReview;
use App\Models\ConceptDesignReviewDiscussionReply;
use App\Models\ConceptDesignReviewDiscussionTopic;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ConceptDesignReviewDiscussionController extends Controller
{
    public function index($reviewId)
    {
        $review = $this->findReview($reviewId);
        if (! $review) {
            return $this->returnErrorData('ไม่พบข้อมูล', 404);
        }

        $topics = ConceptDesignReviewDiscussionTopic::query()
            ->where('concept_design_review_id', $review->id)
            ->whereNull('deleted_at')
            ->with(['replies'])
            ->orderBy('topic_no')
            ->orderBy('id')
            ->get()
            ->map(fn ($topic) => $this->transformTopic($topic))
            ->values();

        return $this->returnSuccess('success', $topics);
    }

    public function storeTopic(Request $request, $reviewId)
    {
        $review = $this->findReview($reviewId);
        if (! $review) {
            return $this->returnErrorData('ไม่พบข้อมูล', 404);
        }

        $message = trim((string) $request->input('message', ''));
        if ($message === '') {
            return $this->returnErrorData('message is required', 422);
        }

        DB::beginTransaction();

        try {
            $topic = new ConceptDesignReviewDiscussionTopic();
            $topic->concept_design_review_id = $review->id;
            $topic->topic_no = $this->nextTopicNumber($review->id);
            $topic->author_code = $this->nullableString($request->input('author_code'));
            $topic->author_name = $this->nullableString($request->input('author_name'));
            $topic->author_role = $this->normalizeAuthorRole($request->input('author_role'));
            $topic->message = $message;
            $topic->status = $this->normalizeStatus($request->input('status'));
            $topic->attachments = $this->encodeJson($this->normalizeAttachments($request->input('attachments')));
            $topic->create_by = $this->resolveActorId($request);
            $topic->update_by = $this->resolveActorId($request);
            $topic->save();

            DB::commit();

            return $this->returnSuccess('บันทึกข้อมูลสำเร็จ', $this->transformTopic($topic->load('replies')));
        } catch (\Throwable $e) {
            DB::rollBack();

            return $this->returnErrorData($e->getMessage(), 500);
        }
    }

    public function showTopic($topicId)
    {
        $topic = $this->findTopic($topicId, true);
        if (! $topic) {
            return $this->returnErrorData('ไม่พบข้อมูล', 404);
        }

        return $this->returnSuccess('success', $this->transformTopic($topic));
    }

    public function updateTopic(Request $request, $topicId)
    {
        $topic = $this->findTopic($topicId, true);
        if (! $topic) {
            return $this->returnErrorData('ไม่พบข้อมูล', 404);
        }

        DB::beginTransaction();

        try {
            if ($request->has('message')) {
                $message = trim((string) $request->input('message', ''));
                if ($message === '') {
                    return $this->returnErrorData('message is required', 422);
                }
                $topic->message = $message;
            }

            if ($request->has('status')) {
                $topic->status = $this->normalizeStatus($request->input('status'));
            }

            if ($request->has('attachments')) {
                $topic->attachments = $this->encodeJson(
                    $this->normalizeAttachments($request->input('attachments'))
                );
            }

            if ($request->has('author_code')) {
                $topic->author_code = $this->nullableString($request->input('author_code'));
            }

            if ($request->has('author_name')) {
                $topic->author_name = $this->nullableString($request->input('author_name'));
            }

            if ($request->has('author_role')) {
                $topic->author_role = $this->normalizeAuthorRole($request->input('author_role'));
            }

            $topic->update_by = $this->resolveActorId($request);
            $topic->save();

            DB::commit();

            return $this->returnUpdateReturnData('อัปเดตข้อมูลสำเร็จ', $this->transformTopic($topic->load('replies')));
        } catch (\Throwable $e) {
            DB::rollBack();

            return $this->returnErrorData($e->getMessage(), 500);
        }
    }

    public function deleteTopic(Request $request, $topicId)
    {
        $topic = $this->findTopic($topicId, true);
        if (! $topic) {
            return $this->returnErrorData('ไม่พบข้อมูล', 404);
        }

        DB::beginTransaction();

        try {
            $actorId = $this->resolveActorId($request);

            ConceptDesignReviewDiscussionReply::query()
                ->where('topic_id', $topic->id)
                ->whereNull('deleted_at')
                ->get()
                ->each(function (ConceptDesignReviewDiscussionReply $reply) use ($actorId) {
                    $reply->update_by = $actorId;
                    $reply->save();
                    $reply->delete();
                });

            $topic->update_by = $actorId;
            $topic->save();
            $topic->delete();

            DB::commit();

            return $this->returnSuccess('ลบข้อมูลสำเร็จ', []);
        } catch (\Throwable $e) {
            DB::rollBack();

            return $this->returnErrorData($e->getMessage(), 500);
        }
    }

    public function storeReply(Request $request, $topicId)
    {
        $topic = $this->findTopic($topicId);
        if (! $topic) {
            return $this->returnErrorData('ไม่พบข้อมูล', 404);
        }

        $message = trim((string) $request->input('message', ''));
        if ($message === '') {
            return $this->returnErrorData('message is required', 422);
        }

        DB::beginTransaction();

        try {
            $reply = new ConceptDesignReviewDiscussionReply();
            $reply->topic_id = $topic->id;
            $reply->author_code = $this->nullableString($request->input('author_code'));
            $reply->author_name = $this->nullableString($request->input('author_name'));
            $reply->author_role = $this->normalizeAuthorRole($request->input('author_role'));
            $reply->message = $message;
            $reply->attachments = $this->encodeJson($this->normalizeAttachments($request->input('attachments')));
            $reply->create_by = $this->resolveActorId($request);
            $reply->update_by = $this->resolveActorId($request);
            $reply->save();

            if ($request->has('topic_status')) {
                $topic->status = $this->normalizeStatus($request->input('topic_status'));
                $topic->update_by = $this->resolveActorId($request);
                $topic->save();
            }

            DB::commit();

            return $this->returnSuccess('บันทึกข้อมูลสำเร็จ', $this->transformReply($reply));
        } catch (\Throwable $e) {
            DB::rollBack();

            return $this->returnErrorData($e->getMessage(), 500);
        }
    }

    public function updateReply(Request $request, $replyId)
    {
        $reply = ConceptDesignReviewDiscussionReply::query()
            ->where('id', $replyId)
            ->whereNull('deleted_at')
            ->first();

        if (! $reply) {
            return $this->returnErrorData('ไม่พบข้อมูล', 404);
        }

        DB::beginTransaction();

        try {
            if ($request->has('message')) {
                $message = trim((string) $request->input('message', ''));
                if ($message === '') {
                    return $this->returnErrorData('message is required', 422);
                }
                $reply->message = $message;
            }

            if ($request->has('attachments')) {
                $reply->attachments = $this->encodeJson(
                    $this->normalizeAttachments($request->input('attachments'))
                );
            }

            if ($request->has('author_code')) {
                $reply->author_code = $this->nullableString($request->input('author_code'));
            }

            if ($request->has('author_name')) {
                $reply->author_name = $this->nullableString($request->input('author_name'));
            }

            if ($request->has('author_role')) {
                $reply->author_role = $this->normalizeAuthorRole($request->input('author_role'));
            }

            $reply->update_by = $this->resolveActorId($request);
            $reply->save();

            DB::commit();

            return $this->returnUpdateReturnData('อัปเดตข้อมูลสำเร็จ', $this->transformReply($reply));
        } catch (\Throwable $e) {
            DB::rollBack();

            return $this->returnErrorData($e->getMessage(), 500);
        }
    }

    public function deleteReply(Request $request, $replyId)
    {
        $reply = ConceptDesignReviewDiscussionReply::query()
            ->where('id', $replyId)
            ->whereNull('deleted_at')
            ->first();

        if (! $reply) {
            return $this->returnErrorData('ไม่พบข้อมูล', 404);
        }

        DB::beginTransaction();

        try {
            $reply->update_by = $this->resolveActorId($request);
            $reply->save();
            $reply->delete();

            DB::commit();

            return $this->returnSuccess('ลบข้อมูลสำเร็จ', []);
        } catch (\Throwable $e) {
            DB::rollBack();

            return $this->returnErrorData($e->getMessage(), 500);
        }
    }

    protected function findReview($reviewId): ?ConceptDesignReview
    {
        return ConceptDesignReview::query()
            ->where('id', $reviewId)
            ->whereNull('deleted_at')
            ->first();
    }

    protected function findTopic($topicId, bool $withReplies = false): ?ConceptDesignReviewDiscussionTopic
    {
        $query = ConceptDesignReviewDiscussionTopic::query()
            ->where('id', $topicId)
            ->whereNull('deleted_at');

        if ($withReplies) {
            $query->with('replies');
        }

        return $query->first();
    }

    protected function nextTopicNumber(int $reviewId): int
    {
        $currentMax = (int) ConceptDesignReviewDiscussionTopic::query()
            ->where('concept_design_review_id', $reviewId)
            ->max('topic_no');

        return $currentMax + 1;
    }

    protected function transformTopic(ConceptDesignReviewDiscussionTopic $topic): array
    {
        $replies = $topic->relationLoaded('replies')
            ? $topic->replies->map(fn ($reply) => $this->transformReply($reply))->values()->all()
            : [];

        return [
            'id' => $topic->id,
            'topic_no' => (int) $topic->topic_no,
            'date' => optional($topic->created_at)->format('Y-m-d H:i:s'),
            'author' => $topic->author_name ?: ($topic->author_code ?: 'Unknown'),
            'author_code' => $topic->author_code,
            'author_name' => $topic->author_name,
            'author_role' => $topic->author_role,
            'comment' => $topic->message,
            'message' => $topic->message,
            'attachments' => $this->decodeJsonArray($topic->attachments),
            'status' => ucfirst($topic->status ?: 'open'),
            'status_key' => $topic->status ?: 'open',
            'replies' => $replies,
            'created_at' => $topic->created_at,
            'updated_at' => $topic->updated_at,
        ];
    }

    protected function transformReply(ConceptDesignReviewDiscussionReply $reply): array
    {
        return [
            'id' => $reply->id,
            'author' => $reply->author_name ?: ($reply->author_code ?: 'Unknown'),
            'author_code' => $reply->author_code,
            'author_name' => $reply->author_name,
            'author_role' => $reply->author_role,
            'date' => optional($reply->created_at)->format('Y-m-d H:i:s'),
            'message' => $reply->message,
            'attachments' => $this->decodeJsonArray($reply->attachments),
            'created_at' => $reply->created_at,
            'updated_at' => $reply->updated_at,
        ];
    }

    protected function normalizeStatus($value): string
    {
        $normalized = strtolower(trim((string) $value));

        if (in_array($normalized, ['resolved', 'done', 'closed'], true)) {
            return 'resolved';
        }

        if (in_array($normalized, ['pending', 'waiting'], true)) {
            return 'pending';
        }

        return 'open';
    }

    protected function normalizeAuthorRole($value): string
    {
        $normalized = strtolower(trim((string) $value));

        return $normalized === 'team' ? 'team' : 'reviewer';
    }

    protected function normalizeAttachments($value): array
    {
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $value = $decoded;
            }
        }

        if (! is_array($value)) {
            return [];
        }

        $attachments = [];

        foreach ($value as $attachment) {
            if (! is_array($attachment)) {
                continue;
            }

            $path = $this->nullableString($attachment['path'] ?? $attachment['url'] ?? null);
            $name = $this->nullableString($attachment['name'] ?? $attachment['file_name'] ?? null);
            $type = strtolower(trim((string) ($attachment['type'] ?? 'file')));

            if (! $path && ! $name) {
                continue;
            }

            $attachments[] = [
                'type' => $type === 'link' ? 'link' : 'file',
                'name' => $name ?: $path,
                'path' => $path,
            ];
        }

        return $attachments;
    }

    protected function decodeJsonArray($value): array
    {
        if (! $value) {
            return [];
        }

        $decoded = json_decode($value, true);

        return is_array($decoded) ? $decoded : [];
    }

    protected function encodeJson(array $value): ?string
    {
        if (empty($value)) {
            return null;
        }

        return json_encode($value, JSON_UNESCAPED_UNICODE);
    }

    protected function nullableString($value): ?string
    {
        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }
}

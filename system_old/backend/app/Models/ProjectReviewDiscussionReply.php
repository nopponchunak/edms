<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class ProjectReviewDiscussionReply extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $guarded = [];

    protected $table = 'project_review_discussion_replies';

    public function topic(): BelongsTo
    {
        return $this->belongsTo(ProjectReviewDiscussionTopic::class, 'topic_id');
    }
}

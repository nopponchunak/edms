<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class ProjectReviewDiscussionTopic extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $guarded = [];

    protected $table = 'project_review_discussion_topics';

    public function replies(): HasMany
    {
        return $this->hasMany(ProjectReviewDiscussionReply::class, 'topic_id')
            ->whereNull('deleted_at')
            ->orderBy('id');
    }
}

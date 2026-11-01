<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class ConceptDesignReviewDiscussionReply extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $guarded = [];

    public function topic(): BelongsTo
    {
        return $this->belongsTo(ConceptDesignReviewDiscussionTopic::class, 'topic_id');
    }
}

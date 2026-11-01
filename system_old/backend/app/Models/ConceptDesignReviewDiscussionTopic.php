<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class ConceptDesignReviewDiscussionTopic extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $guarded = [];

    public function review(): BelongsTo
    {
        return $this->belongsTo(ConceptDesignReview::class, 'concept_design_review_id');
    }

    public function replies(): HasMany
    {
        return $this->hasMany(ConceptDesignReviewDiscussionReply::class, 'topic_id')
            ->whereNull('deleted_at')
            ->orderBy('id');
    }
}

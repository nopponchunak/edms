<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class DesignReviewSignature extends Model
{
    use HasFactory;
    use SoftDeletes;
    protected $fillable = [
        'design_review_id',
        'role',
        'user_id',
        'action_status',
        'note',
        'action_at',
    ];

    public function designReview()
    {
        return $this->belongsTo(DesignReview::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class DesignReviewDocument extends Model
{
    use HasFactory;
    use SoftDeletes;
    protected $fillable = [
        'design_review_id',
        'document_type'
    ];
}

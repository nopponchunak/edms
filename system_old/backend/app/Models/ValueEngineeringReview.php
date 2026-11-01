<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ValueEngineeringReview extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $guarded = [];

    protected $casts = [
        'reviewed_by_date' => 'datetime',
        'responded_by_date' => 'datetime',
        'signed_by_date' => 'datetime',
        'client_project_manager_signed_by_date' => 'datetime',
        'acknowledged_by_date' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'deleted_at' => 'datetime',
    ];
}

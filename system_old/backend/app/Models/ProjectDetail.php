<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ProjectDetail extends Model
{
    use HasFactory;
    use SoftDeletes;
    protected $table = 'project_details';

    protected $fillable = [
        'code',
        'name',
        'detail',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'integer',
    ];
}

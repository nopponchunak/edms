<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class PostmanProjectQualityAssurancePlan extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $table = 'postman_project_quality_assurance_plans';

    protected $guarded = [];
}

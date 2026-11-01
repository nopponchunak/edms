<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class SubConsultantType extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $table = 'sub_consultant_types';

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

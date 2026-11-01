<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ProjectType extends Model
{
    use HasFactory;
    use SoftDeletes;
    protected $table = 'project_types';

    protected $fillable = [
        'code',
        'name',
        'detail',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'integer',
    ];

    public function feeSheets()
    {
        return $this->hasMany(FeeSheet::class, 'project_type_id');
    }

}

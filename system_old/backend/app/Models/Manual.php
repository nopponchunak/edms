<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Manual extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $table = 'manuals';

    protected $fillable = [
        'title',
        'description',
        'original_file_name',
        'stored_file_name',
        'file_path',
        'mime_type',
        'file_extension',
        'file_size',
        'status',
        'uploaded_by',
        'create_by',
        'update_by',
    ];

    protected $casts = [
        'file_size' => 'integer',
    ];

    public function mappings()
    {
        return $this->hasMany(ManualPageMapping::class, 'manual_id')
            ->orderBy('display_order')
            ->orderBy('id');
    }

    public function activeMappings()
    {
        return $this->hasMany(ManualPageMapping::class, 'manual_id')
            ->where('is_active', 1)
            ->orderBy('display_order')
            ->orderBy('id');
    }
}

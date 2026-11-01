<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ManualPageMapping extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $table = 'manual_page_mappings';

    protected $fillable = [
        'manual_id',
        'menu_id',
        'url_path',
        'normalized_path',
        'match_type',
        'display_order',
        'is_active',
        'create_by',
        'update_by',
    ];

    protected $casts = [
        'manual_id' => 'integer',
        'menu_id' => 'integer',
        'display_order' => 'integer',
        'is_active' => 'integer',
    ];

    public function manual()
    {
        return $this->belongsTo(Manual::class, 'manual_id');
    }

    public function menu()
    {
        return $this->belongsTo(Menu::class, 'menu_id');
    }
}

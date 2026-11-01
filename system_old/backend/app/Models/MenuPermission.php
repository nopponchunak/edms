<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class MenuPermission extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $table = 'menu_permissions';

    protected $fillable = [
        'permission_id',
        'menu_id',
        'view',
        'edit',
        'save',
        'delete',
        'create',
        'view_own',
        'edit_own',
        'delete_own',
        'view_all',
        'edit_all',
        'delete_all',
        'create_by',
        'update_by',
    ];

    protected $casts = [
        'permission_id' => 'integer',
        'menu_id' => 'integer',
        'view' => 'integer',
        'edit' => 'integer',
        'save' => 'integer',
        'delete' => 'integer',
        'create' => 'integer',
        'view_own' => 'integer',
        'edit_own' => 'integer',
        'delete_own' => 'integer',
        'view_all' => 'integer',
        'edit_all' => 'integer',
        'delete_all' => 'integer',
    ];

    public function permission()
    {
        return $this->belongsTo(Permission::class);
    }

    public function menu()
    {
        return $this->belongsTo(Menu::class);
    }
}

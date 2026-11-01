<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Permission extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'name',
        'create_by',
        'update_by',
    ];

    public function users()
    {
        return $this->hasMany(User::class);
    }

    public function menuPermissions()
    {
        return $this->hasMany(MenuPermission::class);
    }

    public function menus()
    {
        return $this->belongsToMany(Menu::class, 'menu_permissions', 'permission_id', 'menu_id')
            ->withPivot([
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
                'deleted_at',
            ])
            ->wherePivotNull('deleted_at');
    }
}

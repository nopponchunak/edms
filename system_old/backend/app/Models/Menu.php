<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Menu extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $casts = [
        'main_menu_id' => 'integer',
        'parent_id' => 'integer',
        'sort_order' => 'integer',
    ];

    public function main_menu()
    {
        return $this->belongsTo(MainMenu::class, 'main_menu_id');
    }

    public function parent()
    {
        return $this->belongsTo(Menu::class, 'parent_id');
    }

    public function children()
    {
        return $this->hasMany(Menu::class, 'parent_id')->orderBy('sort_order')->orderBy('id');
    }

    public function permissions()
    {
        return $this->belongsToMany(Permission::class, 'menu_permissions', 'menu_id', 'permission_id')
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

    public function menuPermissions()
    {
        return $this->hasMany(MenuPermission::class);
    }
}

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddActionColumnsToMenuPermissionsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('menu_permissions', function (Blueprint $table) {
            if (!Schema::hasColumn('menu_permissions', 'view')) {
                $table->tinyInteger('view')->default(0)->after('menu_id');
            }
            if (!Schema::hasColumn('menu_permissions', 'edit')) {
                $table->tinyInteger('edit')->default(0)->after('view');
            }
            if (!Schema::hasColumn('menu_permissions', 'save')) {
                $table->tinyInteger('save')->default(0)->after('edit');
            }
            if (!Schema::hasColumn('menu_permissions', 'delete')) {
                $table->tinyInteger('delete')->default(0)->after('save');
            }
        });

        Schema::table('menu_permissions', function (Blueprint $table) {
            // Prevent duplicates per role/menu.
            // Ignore if already exists (older MySQL will throw on duplicate).
            try {
                $table->unique(['permission_id', 'menu_id'], 'menu_permissions_permission_menu_unique');
            } catch (\Throwable $e) {
                // noop
            }
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('menu_permissions', function (Blueprint $table) {
            if (Schema::hasColumn('menu_permissions', 'view')) {
                $table->dropColumn('view');
            }
            if (Schema::hasColumn('menu_permissions', 'edit')) {
                $table->dropColumn('edit');
            }
            if (Schema::hasColumn('menu_permissions', 'save')) {
                $table->dropColumn('save');
            }
            if (Schema::hasColumn('menu_permissions', 'delete')) {
                $table->dropColumn('delete');
            }
        });

        Schema::table('menu_permissions', function (Blueprint $table) {
            try {
                $table->dropUnique('menu_permissions_permission_menu_unique');
            } catch (\Throwable $e) {
                // noop
            }
        });
    }
}


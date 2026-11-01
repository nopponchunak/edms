<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddParentIdAndSortOrderToMenusTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('menus', function (Blueprint $table) {
            if (!Schema::hasColumn('menus', 'parent_id')) {
                $table->integer('parent_id')->unsigned()->nullable()->index()->after('main_menu_id');
            }
            if (!Schema::hasColumn('menus', 'sort_order')) {
                $table->integer('sort_order')->nullable()->index()->after('name');
            }
        });

        Schema::table('menus', function (Blueprint $table) {
            if (Schema::hasColumn('menus', 'parent_id')) {
                try {
                    $table->foreign('parent_id')->references('id')->on('menus')->nullOnDelete();
                } catch (\Throwable $e) {
                    // noop
                }
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
        Schema::table('menus', function (Blueprint $table) {
            try {
                $table->dropForeign(['parent_id']);
            } catch (\Throwable $e) {
                // noop
            }

            if (Schema::hasColumn('menus', 'parent_id')) {
                $table->dropColumn('parent_id');
            }
            if (Schema::hasColumn('menus', 'sort_order')) {
                $table->dropColumn('sort_order');
            }
        });
    }
}


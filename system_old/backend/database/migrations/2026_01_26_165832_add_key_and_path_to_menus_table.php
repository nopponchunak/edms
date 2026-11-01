<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddKeyAndPathToMenusTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('menus', function (Blueprint $table) {
            if (!Schema::hasColumn('menus', 'key')) {
                $table->string('key', 150)->charset('utf8')->nullable()->after('sort_order');
            }
            if (!Schema::hasColumn('menus', 'path')) {
                $table->string('path', 255)->charset('utf8')->nullable()->after('key');
            }
        });

        Schema::table('menus', function (Blueprint $table) {
            // unique key (nullable is allowed; multiple NULLs are OK in MySQL)
            try {
                $table->unique('key', 'menus_key_unique');
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
        Schema::table('menus', function (Blueprint $table) {
            try {
                $table->dropUnique('menus_key_unique');
            } catch (\Throwable $e) {
                // noop
            }

            if (Schema::hasColumn('menus', 'path')) {
                $table->dropColumn('path');
            }
            if (Schema::hasColumn('menus', 'key')) {
                $table->dropColumn('key');
            }
        });
    }
}


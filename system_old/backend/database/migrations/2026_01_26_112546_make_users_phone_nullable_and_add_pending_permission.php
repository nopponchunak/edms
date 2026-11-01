<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class MakeUsersPhoneNullableAndAddPendingPermission extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        // Ensure a default role exists for newly synced LDAP employees that have not been approved yet.
        if (!DB::table('permissions')->where('name', 'PENDING')->exists()) {
            DB::table('permissions')->insert([
                'name' => 'PENDING',
                'create_by' => 'system',
                'update_by' => 'system',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        // Make users.phone nullable without requiring doctrine/dbal.
        // MySQL/MariaDB: alter column.
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE `users` MODIFY `phone` VARCHAR(100) NULL");
            return;
        }

        // Fallback for other drivers (may require doctrine/dbal for change()).
        Schema::table('users', function (Blueprint $table) {
            $table->string('phone', 100)->nullable()->change();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE `users` MODIFY `phone` VARCHAR(100) NOT NULL");
            return;
        }

        Schema::table('users', function (Blueprint $table) {
            $table->string('phone', 100)->nullable(false)->change();
        });

        // Do not delete PENDING permission automatically; it may be in use.
    }
}


<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class UpdateAllowanceAfter10pmAttachments extends Migration
{
    public function up()
    {
        if (! Schema::hasTable('allowance_after_10pm')) {
            return;
        }

        if (Schema::hasColumn('allowance_after_10pm', 'to_department')) {
            Schema::table('allowance_after_10pm', function (Blueprint $table) {
                $table->dropColumn('to_department');
            });
        }

        if (! Schema::hasColumn('allowance_after_10pm', 'attachments')) {
            Schema::table('allowance_after_10pm', function (Blueprint $table) {
                $table->longText('attachments')->nullable()->after('total_baht');
            });
        }
    }

    public function down()
    {
        if (! Schema::hasTable('allowance_after_10pm')) {
            return;
        }

        if (! Schema::hasColumn('allowance_after_10pm', 'to_department')) {
            Schema::table('allowance_after_10pm', function (Blueprint $table) {
                $table->string('to_department', 255)->charset('utf8')->default('Accounts/File')->after('id');
            });
        }

        if (Schema::hasColumn('allowance_after_10pm', 'attachments')) {
            Schema::table('allowance_after_10pm', function (Blueprint $table) {
                $table->dropColumn('attachments');
            });
        }
    }
}

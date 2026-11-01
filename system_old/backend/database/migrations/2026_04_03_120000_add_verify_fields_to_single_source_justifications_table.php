<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('single_source_justifications', function (Blueprint $table) {
            $table->string('verify_by', 255)->nullable()->after('assessed_by_status');
            $table->date('verify_by_date')->nullable()->after('verify_by');
            $table->string('verify_by_status', 255)->nullable()->after('verify_by_date');
            $table->text('verify_by_comment')->nullable()->after('verify_by_status');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('single_source_justifications', function (Blueprint $table) {
            $table->dropColumn([
                'verify_by',
                'verify_by_date',
                'verify_by_status',
                'verify_by_comment',
            ]);
        });
    }
};

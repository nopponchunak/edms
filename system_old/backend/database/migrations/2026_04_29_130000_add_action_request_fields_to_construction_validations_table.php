<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddActionRequestFieldsToConstructionValidationsTable extends Migration
{
    public function up()
    {
        Schema::table('construction_validations', function (Blueprint $table) {
            $table->string('completed_by', 255)->nullable()->after('review_method');
            $table->dateTime('completed_by_date')->nullable()->after('completed_by');
            $table->string('completed_by_status', 50)->nullable()->after('completed_by_date');

            $table->string('responded_by', 255)->nullable()->after('completed_by_status');
            $table->dateTime('responded_by_date')->nullable()->after('responded_by');
            $table->string('responded_by_status', 50)->nullable()->after('responded_by_date');

            $table->string('signed_by_tl', 255)->nullable()->after('responded_by_status');
            $table->dateTime('signed_by_tl_date')->nullable()->after('signed_by_tl');
            $table->string('signed_by_tl_status', 50)->nullable()->after('signed_by_tl_date');

            $table->string('acknowledged_by_tl', 255)->nullable()->after('signed_by_tl_status');
            $table->dateTime('acknowledged_by_tl_date')->nullable()->after('acknowledged_by_tl');
            $table->string('acknowledged_by_tl_status', 50)->nullable()->after('acknowledged_by_tl_date');

            $table->string('acknowledged_by_di', 255)->nullable()->after('acknowledged_by_tl_status');
            $table->dateTime('acknowledged_by_di_date')->nullable()->after('acknowledged_by_di');
            $table->string('acknowledged_by_di_status', 50)->nullable()->after('acknowledged_by_di_date');
        });
    }

    public function down()
    {
        Schema::table('construction_validations', function (Blueprint $table) {
            $table->dropColumn([
                'completed_by',
                'completed_by_date',
                'completed_by_status',
                'responded_by',
                'responded_by_date',
                'responded_by_status',
                'signed_by_tl',
                'signed_by_tl_date',
                'signed_by_tl_status',
                'acknowledged_by_tl',
                'acknowledged_by_tl_date',
                'acknowledged_by_tl_status',
                'acknowledged_by_di',
                'acknowledged_by_di_date',
                'acknowledged_by_di_status',
            ]);
        });
    }
}

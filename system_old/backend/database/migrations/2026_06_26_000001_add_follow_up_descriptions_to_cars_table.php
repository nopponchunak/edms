<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddFollowUpDescriptionsToCarsTable extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('cars')) {
            return;
        }

        if (!Schema::hasColumn('cars', 'ra_ca_satisfactory_description')) {
            Schema::table('cars', function (Blueprint $table) {
                $table->text('ra_ca_satisfactory_description')->nullable()->after('ra_ca_satisfactory');
            });
        }

        if (!Schema::hasColumn('cars', 'further_action_description')) {
            Schema::table('cars', function (Blueprint $table) {
                $afterColumn = Schema::hasColumn('cars', 'further_action_required')
                    ? 'further_action_required'
                    : 'ra_ca_satisfactory_description';

                $table->text('further_action_description')->nullable()->after($afterColumn);
            });
        }
    }

    public function down()
    {
        if (!Schema::hasTable('cars')) {
            return;
        }

        if (Schema::hasColumn('cars', 'further_action_description')) {
            Schema::table('cars', function (Blueprint $table) {
                $table->dropColumn('further_action_description');
            });
        }

        if (Schema::hasColumn('cars', 'ra_ca_satisfactory_description')) {
            Schema::table('cars', function (Blueprint $table) {
                $table->dropColumn('ra_ca_satisfactory_description');
            });
        }
    }
}

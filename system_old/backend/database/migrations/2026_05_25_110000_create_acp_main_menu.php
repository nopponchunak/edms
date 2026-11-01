<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

class CreateAcpMainMenu extends Migration
{
    public function up()
    {
        DB::transaction(function () {
            // 1. Create 'Acp' in main_menus if not exists
            $acpId = DB::table('main_menus')->where('name', 'Acp')->value('id');
            if (!$acpId) {
                $acpId = DB::table('main_menus')->insertGetId([
                    'name' => 'Acp',
                    'sort_order' => 6,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            } else {
                DB::table('main_menus')->where('id', $acpId)->update([
                    'sort_order' => 6,
                    'updated_at' => now(),
                ]);
            }

            // 2. Update 'Setting' or 'Settings' sort_order to 7
            DB::table('main_menus')->where('name', 'Setting')->orWhere('name', 'Settings')->update([
                'sort_order' => 7,
                'updated_at' => now(),
            ]);

            // 3. Move the three menus to 'Acp'
            DB::table('menus')->where('key', 'mm5.charitable_contribution_requests')->update([
                'main_menu_id' => $acpId,
                'sort_order' => 1,
                'updated_at' => now(),
            ]);

            DB::table('menus')->where('key', 'mm5.gift_hospitality_offering_requests')->update([
                'main_menu_id' => $acpId,
                'sort_order' => 2,
                'updated_at' => now(),
            ]);

            DB::table('menus')->where('key', 'mm5.gift_hospitality_requests')->update([
                'main_menu_id' => $acpId,
                'sort_order' => 3,
                'updated_at' => now(),
            ]);

            // 4. Update the remaining menus under IMS Forms
            DB::table('menus')->where('key', 'mm5.controlled_document_request_change')->update([
                'sort_order' => 1,
                'updated_at' => now(),
            ]);

            DB::table('menus')->where('key', 'mm5.car_corrective_action_request')->update([
                'sort_order' => 2,
                'updated_at' => now(),
            ]);
        });
    }

    public function down()
    {
        DB::transaction(function () {
            $imsId = DB::table('main_menus')->where('name', 'IMS Forms')->value('id');
            if ($imsId) {
                DB::table('menus')->where('key', 'mm5.charitable_contribution_requests')->update([
                    'main_menu_id' => $imsId,
                    'sort_order' => 1,
                    'updated_at' => now(),
                ]);

                DB::table('menus')->where('key', 'mm5.controlled_document_request_change')->update([
                    'sort_order' => 2,
                    'updated_at' => now(),
                ]);

                DB::table('menus')->where('key', 'mm5.car_corrective_action_request')->update([
                    'sort_order' => 3,
                    'updated_at' => now(),
                ]);

                DB::table('menus')->where('key', 'mm5.gift_hospitality_offering_requests')->update([
                    'main_menu_id' => $imsId,
                    'sort_order' => 4,
                    'updated_at' => now(),
                ]);

                DB::table('menus')->where('key', 'mm5.gift_hospitality_requests')->update([
                    'main_menu_id' => $imsId,
                    'sort_order' => 5,
                    'updated_at' => now(),
                ]);
            }

            DB::table('main_menus')->where('name', 'Setting')->orWhere('name', 'Settings')->update([
                'sort_order' => 6,
                'updated_at' => now(),
            ]);

            DB::table('main_menus')->where('name', 'Acp')->delete();
        });
    }
}

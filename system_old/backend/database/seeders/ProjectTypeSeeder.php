<?php

namespace Database\Seeders;

use App\Models\ProjectType;
use Illuminate\Database\Seeder;

class ProjectTypeSeeder extends Seeder
{
    private const LEGACY_NON_PROJECT_TYPE_CODES = [
        '001',
        '002',
        '003',
        '004',
        '005',
        '006',
        '007',
        '008',
        '009',
        '010',
        '011',
    ];

    public function run(): void
    {
        $projectTypes = [
            ['code' => 'A', 'name' => 'Commercial-Office'],
            ['code' => 'B', 'name' => 'Commercial-General'],
            ['code' => 'C', 'name' => 'Industrial'],
            ['code' => 'D', 'name' => 'Institutional'],
            ['code' => 'E', 'name' => 'Leisure/Recreation/Tourism'],
            ['code' => 'H', 'name' => 'Infrastructure/Utilities'],
            ['code' => 'I', 'name' => 'Residential'],
            ['code' => 'K', 'name' => 'Miscellaneous'],
            ['code' => 'L', 'name' => 'Geotechnical'],
            ['code' => 'M', 'name' => 'Environmental'],
            ['code' => 'Q', 'name' => 'Aviation'],
            ['code' => 'R', 'name' => 'Accredited Checking & Value Engineering'],
            ['code' => 'S', 'name' => 'Healthcare'],
            ['code' => 'T', 'name' => 'Fitout'],
            ['code' => 'U', 'name' => 'Building Audit'],
            ['code' => 'V', 'name' => 'PM/CM'],
        ];

        foreach ($projectTypes as $projectType) {
            ProjectType::firstOrCreate(
                ['code' => $projectType['code']],
                [
                    'name' => $projectType['name'],
                    'detail' => null,
                    'is_active' => 1,
                ]
            );
        }

        ProjectType::whereIn('code', self::LEGACY_NON_PROJECT_TYPE_CODES)
            ->update(['is_active' => 0]);
    }
}

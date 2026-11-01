<?php

namespace App\Imports;

use App\Models\User;
use Maatwebsite\Excel\Concerns\Importable;
use Maatwebsite\Excel\Concerns\SkipsErrors;
use Maatwebsite\Excel\Concerns\SkipsOnError;
use Maatwebsite\Excel\Concerns\ToModel;
use Maatwebsite\Excel\Concerns\WithStartRow;

class UserImport implements ToModel, WithStartRow, SkipsOnError
{
    use Importable, SkipsErrors;

    /**
     * @return int
     */
    public function StartRow(): int
    {
        return 2;
    }

    /**
     * @param array $row
     *
     * @return User|null
     */
    public function model(array $row)
    {

        return new User([
            //
        ]);

    }

}

<?php

namespace App\Services;

use PDO;
use RuntimeException;

class LegacyDesignReviewService
{
    private const STATUS_LABELS = [
        0 => 'Draft',
        1 => 'VVE to review',
        2 => 'TE to response',
        3 => 'VVE to approve',
        4 => 'TL to review',
        5 => 'DI to acknowledge',
        6 => 'Completed',
        7 => 'Closed',
    ];

    private const ACTION_STATUS_LABELS = [
        0 => 'New',
        1 => 'On Process',
        2 => 'Completed',
        3 => 'Closed',
    ];

    private const STAGES = [
        'peer-review' => [
            'key' => 'peer-review',
            'label' => 'Peer Review',
            'legacyStageLabel' => 'Peer Review',
            'table' => 'tb_PeerReview',
            'idColumn' => 'PeerReview_ID',
            'webboardTable' => 'tb_Webboard_Peer',
            'scoreCount' => 8,
            'detailRoute' => 'peer-reviews',
        ],
        'design-criteria-report' => [
            'key' => 'design-criteria-report',
            'label' => 'Design Criteria Report',
            'legacyStageLabel' => 'Design Brief',
            'table' => 'tb_Brief',
            'idColumn' => 'Brief_ID',
            'webboardTable' => 'tb_Webboard_Brief',
            'scoreCount' => 11,
        ],
        'submission' => [
            'key' => 'submission',
            'label' => 'Submission',
            'legacyStageLabel' => 'Submission',
            'table' => 'tb_Submission',
            'idColumn' => 'Submission_ID',
            'webboardTable' => 'tb_Webboard_Sub',
            'scoreCount' => 11,
        ],
        'tender-design-review' => [
            'key' => 'tender-design-review',
            'label' => 'Tender Design Review',
            'legacyStageLabel' => 'Tender Design Review',
            'table' => 'tb_TenderDesignReview',
            'idColumn' => 'TenderDes_ID',
            'webboardTable' => 'tb_Webboard_TenderRev',
            'scoreCount' => 11,
        ],
        'tender-design-verification' => [
            'key' => 'tender-design-verification',
            'label' => 'Tender Design Verification',
            'legacyStageLabel' => 'Tender Design Verification',
            'table' => 'tb_TenderVerification',
            'idColumn' => 'TenderVer_ID',
            'webboardTable' => 'tb_Webboard_TenderVer',
            'scoreCount' => 13,
        ],
        'construction' => [
            'key' => 'construction',
            'label' => 'Construction',
            'legacyStageLabel' => 'Construction',
            'table' => 'tb_Construction',
            'idColumn' => 'Construction_ID',
            'webboardTable' => 'tb_Webboard_Constr',
            'scoreCount' => 13,
        ],
        '23-mtea-01' => [
            'key' => '23-mtea-01',
            'label' => '23-MTEA-01',
            'legacyStageLabel' => '23MTEA',
            'table' => 'tb_23MTEA',
            'idColumn' => 'mtea_ID',
            'webboardTable' => 'tb_Webboard_23mtea01',
            'scoreCount' => 9,
        ],
        '24-mtve-01' => [
            'key' => '24-mtve-01',
            'label' => '24-MTVE-01',
            'legacyStageLabel' => '24MTVE',
            'table' => 'tb_24MTVE',
            'idColumn' => 'mtve_ID',
            'webboardTable' => 'tb_Webboard_24mtve01',
            'scoreCount' => 12,
        ],
    ];

    private ?PDO $pdo = null;

    public function health(): array
    {
        $row = $this->fetchOne('SELECT DB_NAME() AS dbName, @@VERSION AS version');

        return [
            'database' => $row['dbName'] ?? null,
            'version' => isset($row['version']) ? strtok((string) $row['version'], "\n") : null,
            'stages' => array_values(self::STAGES),
        ];
    }

    public function stages(): array
    {
        return array_map(function (array $stage) {
            return [
                'key' => $stage['key'],
                'label' => $stage['label'],
                'legacyStageLabel' => $stage['legacyStageLabel'],
                'table' => $stage['table'],
                'idColumn' => $stage['idColumn'],
                'webboardTable' => $stage['webboardTable'],
            ];
        }, array_values(self::STAGES));
    }

    public function stageCounts(): array
    {
        return array_map(function (array $stage) {
            $table = $stage['table'];
            $row = $this->fetchOne("
                SELECT
                    COUNT(*) AS total,
                    SUM(CASE WHEN Status NOT IN (0, 6) THEN 1 ELSE 0 END) AS active
                FROM dbo.{$table}
            ");

            return [
                'key' => $stage['key'],
                'label' => $stage['label'],
                'table' => $table,
                'total' => (int) ($row['total'] ?? 0),
                'active' => (int) ($row['active'] ?? 0),
            ];
        }, array_values(self::STAGES));
    }

    public function stageSummary(string $stageKey, int $limit = 300, ?string $search = null, string $status = 'active'): array
    {
        $stage = $this->stageConfig($stageKey);
        $limit = max(1, min($limit, 5000));
        $table = $stage['table'];
        $idColumn = $stage['idColumn'];

        $whereClauses = [];
        $params = [];
        $normalizedStatus = strtolower(trim($status));

        if ($normalizedStatus === 'completed') {
            $whereClauses[] = 'main.Status IN (6, 7)';
        } elseif ($normalizedStatus !== 'all') {
            $whereClauses[] = 'main.Status NOT IN (0, 6)';
        }

        if ($search !== null && trim($search) !== '') {
            $whereClauses[] = '(main.ProjectID LIKE ? OR p.Project_Name LIKE ? OR d.Discipline_Name LIKE ?)';
            $term = '%' . trim($search) . '%';
            $params = [$term, $term, $term];
        }

        $where = count($whereClauses) > 0 ? 'WHERE ' . implode(' AND ', $whereClauses) : '';

        $rows = $this->fetchAll("
            SELECT TOP {$limit}
                main.{$idColumn} AS id,
                main.ProjectID AS projectId,
                p.Project_Name AS projectName,
                d.Discipline_Name AS discipline,
                main.Create_Date AS createdDate,
                te.FullName AS teamEngineer,
                rv.FullName AS reviewer,
                tl.FullName AS teamlead,
                dir.FullName AS director,
                main.Status AS statusCode
            FROM dbo.{$table} main
            LEFT JOIN dbo.tb_Project p ON p.ProjectID = main.ProjectID
            LEFT JOIN dbo.tb_Discipline d ON d.Discipline_ID = main.Discipline_ID
            LEFT JOIN dbo.tb_User te ON te.UserID = main.UserID
            LEFT JOIN dbo.tb_User rv ON rv.UserID = main.Reviewer_ID
            LEFT JOIN dbo.tb_User tl ON tl.UserID = main.Teamlead_ID
            LEFT JOIN dbo.tb_User dir ON dir.UserID = main.Director_ID
            {$where}
            ORDER BY main.Create_Date ASC, main.{$idColumn} ASC
        ", $params);

        return array_map(function (array $row) use ($stage) {
            return [
                'id' => (int) $row['id'],
                'stage' => [
                    'key' => $stage['key'],
                    'label' => $stage['label'],
                    'legacyLabel' => $stage['legacyStageLabel'],
                ],
                'projectId' => $row['projectId'],
                'projectName' => $row['projectName'],
                'discipline' => $row['discipline'],
                'createdDate' => $this->dateOnly($row['createdDate'] ?? null),
                'teamEngineer' => $this->cleanText($row['teamEngineer'] ?? null),
                'reviewer' => $this->cleanText($row['reviewer'] ?? null),
                'teamlead' => $this->cleanText($row['teamlead'] ?? null),
                'director' => $this->cleanText($row['director'] ?? null),
                'status' => $this->statusPayload($row['statusCode'] ?? null),
            ];
        }, $rows);
    }

    public function peerReviewDetail(int $id): ?array
    {
        return $this->itemDetail('peer-review', $id);
    }

    public function itemDetail(string $stageKey, int $id): ?array
    {
        $stage = $this->stageConfig($stageKey);
        $table = $stage['table'];
        $idColumn = $stage['idColumn'];

        $row = $this->fetchOne("
            SELECT
                main.*,
                p.Project_Name AS Project_Name,
                d.Discipline_Name AS Discipline_Name,
                te.FullName AS PreparedBy,
                rv.FullName AS Reviewer,
                tl.FullName AS Teamlead,
                dir.FullName AS Director
            FROM dbo.{$table} main
            LEFT JOIN dbo.tb_Project p ON p.ProjectID = main.ProjectID
            LEFT JOIN dbo.tb_Discipline d ON d.Discipline_ID = main.Discipline_ID
            LEFT JOIN dbo.tb_User te ON te.UserID = main.UserID
            LEFT JOIN dbo.tb_User rv ON rv.UserID = main.Reviewer_ID
            LEFT JOIN dbo.tb_User tl ON tl.UserID = main.Teamlead_ID
            LEFT JOIN dbo.tb_User dir ON dir.UserID = main.Director_ID
            WHERE main.{$idColumn} = ?
        ", [$id]);

        if (! $row) {
            return null;
        }

        return [
            'id' => (int) $row[$idColumn],
            'stageKey' => $stage['key'],
            'stage' => $stage['label'],
            'legacyStage' => $row['Stage'] ?? $row['stage'] ?? $stage['legacyStageLabel'],
            'source' => [
                'table' => $table,
                'idColumn' => $idColumn,
                'webboardTable' => $stage['webboardTable'],
            ],
            'project' => [
                'id' => $row['ProjectID'],
                'name' => $row['Project_Name'],
            ],
            'preparedBy' => $this->cleanText($row['PreparedBy'] ?? null),
            'fileLocation' => $row['File_Location'],
            'involved' => [
                'names' => $row['InvolvName'],
                'emails' => $row['InvolvEmail'],
            ],
            'discipline' => [
                'id' => isset($row['Discipline_ID']) ? (int) $row['Discipline_ID'] : null,
                'name' => $row['Discipline_Name'],
                'other' => $row['Discipline_Other'],
            ],
            'documents' => $this->splitLegacyList($row['Documents'] ?? null),
            'documentOther' => $row['Document_Other'],
            'scores' => $this->scores($row, (int) ($stage['scoreCount'] ?? 8)),
            'comment' => $row['Comment'],
            'recommend' => $row['Recommend'] ?? null,
            'qualityProcedure' => $row['Quality_Procedure'] ?? null,
            'note' => $row['Note'],
            'satisfactorily' => $row['Satisfactorily'],
            'people' => [
                'reviewer' => $this->personPayload($row['Reviewer_ID'] ?? null, $row['Reviewer'] ?? null, $row['Review_Date'] ?? null),
                'respondedBy' => $this->personPayload($row['UserID'] ?? null, $row['PreparedBy'] ?? null, $row['Response_Date'] ?? null),
                'teamlead' => $this->personPayload($row['Teamlead_ID'] ?? null, $row['Teamlead'] ?? null, $row['TL_Review_Date'] ?? null),
                'director' => $this->personPayload($row['Director_ID'] ?? null, $row['Director'] ?? null, $row['Acknow_Date'] ?? null),
            ],
            'dates' => [
                'created' => $this->dateOnly($row['Create_Date'] ?? null),
                'reviewed' => $this->dateOnly($row['Review_Date'] ?? null),
                'responded' => $this->dateOnly($row['Response_Date'] ?? null),
                'approved' => $this->dateOnly($row['App_Date'] ?? null),
                'teamleadReviewed' => $this->dateOnly($row['TL_Review_Date'] ?? null),
                'acknowledged' => $this->dateOnly($row['Acknow_Date'] ?? null),
            ],
            'status' => $this->statusPayload($row['Status'] ?? null),
            'actions' => $this->itemActions($stage['key'], $id),
        ];
    }

    public function peerReviewActions(int $id): array
    {
        return $this->itemActions('peer-review', $id);
    }

    public function itemActions(string $stageKey, int $id): array
    {
        $stage = $this->stageConfig($stageKey);
        $webboardTable = $stage['webboardTable'];

        $rows = $this->fetchAll("
            SELECT Topic_ID AS topicId, Question_ID AS questionId, Question AS question, Answer AS answer, Status AS statusCode
            FROM dbo.{$webboardTable}
            WHERE Topic_ID = ?
            ORDER BY Question_ID ASC
        ", [$id]);

        return array_map(function (array $row) {
            return [
                'topicId' => (int) $row['topicId'],
                'questionId' => (int) $row['questionId'],
                'question' => $row['question'],
                'answer' => $row['answer'],
                'status' => [
                    'code' => isset($row['statusCode']) ? (int) $row['statusCode'] : null,
                    'label' => self::ACTION_STATUS_LABELS[(int) ($row['statusCode'] ?? -1)] ?? 'Unknown',
                ],
            ];
        }, $rows);
    }

    private function pdo(): PDO
    {
        if ($this->pdo) {
            return $this->pdo;
        }

        $host = config('legacy_design_review.host');
        $port = config('legacy_design_review.port');
        $database = config('legacy_design_review.database');
        $username = config('legacy_design_review.username');
        $password = config('legacy_design_review.password');
        $tdsVersion = config('legacy_design_review.tds_version', '7.0');

        if ($username === '' || $password === '') {
            throw new RuntimeException('Legacy Design Review database credentials are not configured.');
        }

        putenv('TDSVER=' . $tdsVersion);

        $dsn = "dblib:host={$host}:{$port};dbname={$database};charset=UTF-8";

        $this->pdo = new PDO($dsn, $username, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);

        return $this->pdo;
    }

    private function fetchAll(string $sql, array $params = []): array
    {
        $statement = $this->pdo()->prepare($sql);
        $statement->execute($params);

        return $statement->fetchAll();
    }

    private function fetchOne(string $sql, array $params = []): ?array
    {
        $statement = $this->pdo()->prepare($sql);
        $statement->execute($params);
        $row = $statement->fetch();

        return $row ?: null;
    }

    private function stageConfig(string $stageKey): array
    {
        $normalized = strtolower(trim($stageKey));

        if (! isset(self::STAGES[$normalized])) {
            throw new RuntimeException('Unsupported legacy design review stage.');
        }

        return self::STAGES[$normalized];
    }

    private function statusPayload($code): array
    {
        $intCode = is_numeric($code) ? (int) $code : null;

        return [
            'code' => $intCode,
            'label' => $intCode !== null ? (self::STATUS_LABELS[$intCode] ?? 'Unknown') : 'Unknown',
        ];
    }

    private function personPayload($id, ?string $name, $date): array
    {
        return [
            'id' => is_numeric($id) ? (int) $id : null,
            'name' => $this->cleanText($name),
            'date' => $this->dateOnly($date),
        ];
    }

    private function scores(array $row, int $count): array
    {
        $scores = [];

        for ($i = 1; $i <= $count; $i++) {
            $key = 'Score' . $i;
            $scores['score' . $i] = isset($row[$key]) ? (int) $row[$key] === 1 : null;
        }

        return $scores;
    }

    private function splitLegacyList(?string $value): array
    {
        if ($value === null || trim($value) === '') {
            return [];
        }

        return array_values(array_filter(array_map('trim', explode('|', $value)), fn ($item) => $item !== ''));
    }

    private function dateOnly($value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return substr((string) $value, 0, 10);
    }

    private function cleanText(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        return trim(preg_replace('/\s+/u', ' ', $value));
    }
}

/*
 * Development-only test accounts for walking a request through every approval step:
 * local users ACSC, ACSL, CA, DI and MD, each with an employee record and the matching Committee membership.
 * Re-running the script updates the same rows. It refuses to run in production.
 *
 *   npm run mock:users
 *
 * Sign in with the "local" button on the login page (needs LOCAL_ADMIN_ENABLE=true).
 */
import { randomBytes, scrypt } from 'node:crypto';
import dataSource from '../database/data-source';

const MOCK_PASSWORD = 'password123';

interface MockUser {
  username: string;
  initial: string;
  title: string;
  level: string;
  committee: string;
}

const MOCK_USERS: MockUser[] = [
  { username: 'acsc', initial: 'ACSC', title: 'ACSC Member (mock)', level: 'EE1', committee: 'ACSC' },
  { username: 'acsl', initial: 'ACSL', title: 'ACSL Member (mock)', level: 'EE1', committee: 'ACSL' },
  { username: 'ca', initial: 'CA', title: 'Chief Accountant (mock)', level: 'SES', committee: 'CA' },
  { username: 'di', initial: 'DI', title: 'Director', level: 'DI', committee: 'DI/MD' },
  { username: 'md', initial: 'MD', title: 'Managing Director', level: 'MD', committee: 'DI/MD' },
];

function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(`scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`);
    });
  });
}

async function run(): Promise<void> {
  if (process.env.NODE_ENV === 'production') throw new Error('Mock users must not be created in production.');
  await dataSource.initialize();
  try {
    const roleRows: { id: number }[] = await dataSource.query(`SELECT id FROM roles WHERE code = 'employee'`);
    if (!roleRows[0]) throw new Error('The employee role does not exist; run the migrations first.');

    for (const mock of MOCK_USERS) {
      const code = `MOCK-${mock.initial}`;
      const display = `Mock ${mock.initial}`;
      const email = `${mock.username}@mock.local`;
      const passwordHash = await hashPassword(MOCK_PASSWORD);

      const employee: { id: number }[] = await dataSource.query(
        `INSERT INTO employees (code, username, firstname, lastname, email, department_name, title_name, level_name, initial, employee_status, active, is_approver)
         VALUES ($1, $2, 'Mock', $3, $4, 'Mock accounts', $5, $6, $7, 'active', 'yes', false)
         ON CONFLICT (code) DO UPDATE SET username = EXCLUDED.username, firstname = EXCLUDED.firstname, lastname = EXCLUDED.lastname,
           email = EXCLUDED.email, title_name = EXCLUDED.title_name, level_name = EXCLUDED.level_name, initial = EXCLUDED.initial,
           employee_status = 'active', deleted_at = NULL
         RETURNING id`,
        [code, mock.username, mock.initial, email, mock.title, mock.level, mock.initial],
      );
      const employeeId = employee[0].id;

      const existing: { id: number }[] = await dataSource.query(`SELECT id FROM users WHERE LOWER(username) = $1`, [mock.username]);
      let userId: number;
      if (existing[0]) {
        userId = existing[0].id;
        await dataSource.query(
          `UPDATE users SET display_name = $2, email = $3, code = $4, auth_provider = 'local', status = 'active', password_hash = $5, employee_id = $6, deleted_at = NULL WHERE id = $1`,
          [userId, display, email, code, passwordHash, employeeId],
        );
      } else {
        const created: { id: number }[] = await dataSource.query(
          `INSERT INTO users (username, display_name, email, code, auth_provider, status, password_hash, employee_id, is_super_admin)
           VALUES ($1, $2, $3, $4, 'local', 'active', $5, $6, false) RETURNING id`,
          [mock.username, display, email, code, passwordHash, employeeId],
        );
        userId = created[0].id;
      }

      await dataSource.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, roleRows[0].id],
      );

      const committee: { id: number }[] = await dataSource.query(
        `SELECT id FROM committees WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL`, [mock.committee],
      );
      if (committee[0]) {
        await dataSource.query(
          `INSERT INTO committee_members (committee_id, employee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [committee[0].id, employeeId],
        );
      } else {
        console.warn(`Committee "${mock.committee}" was not found; ${mock.username} was not added to it.`);
      }
      console.log(`${mock.username.padEnd(5)} ready (employee ${code}, committee ${mock.committee})`);
    }
  } finally {
    await dataSource.destroy();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

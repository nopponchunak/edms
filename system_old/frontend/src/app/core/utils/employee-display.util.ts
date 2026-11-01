type EmployeeDisplaySource = {
  code?: string | null;
  initial?: string | null;
  firstname?: string | null;
};

export function resolveEmployeeDisplayInitial(employee: EmployeeDisplaySource): string {
  return String(employee.initial || '').trim().replace(/\.+$/, '');
}

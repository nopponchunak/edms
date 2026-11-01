import { EmployeeOption } from '../services/employee.service';

/**
 * Employee Filter Utilities
 * ไฟล์กลางสำหรับเก็บ code ที่ใช้ filter dropdown ตามตำแหน่ง
 */

/**
 * ตำแหน่งที่รองรับ
 */
export type EmployeePosition = 'DI' | 'MD' | 'TL' | 'IMR' | 'DL' | 'MTL_RECEIVING_STAFF' | 'IMS' | 'MR';

/**
 * Mapping ของตำแหน่งกับ code list
 */
export const POSITION_CODE_MAP: Record<EmployeePosition, string[]> = {
  DI: ['T027'],
  MD: ['T071'],
  TL: ['T013', 'T023', 'T042', 'T045', 'T049', 'T137'],
  IMR: ['T055'],
  DL: ['T012'],
  IMS:['T057'],
  // MTL Receiving Staff - ใส่ code ที่ต้องการ filter ตรงนี้
  // ตัวอย่าง: MTL_RECEIVING_STAFF: ['T001', 'T002'],
  // ถ้ายังไม่ทราบ code ให้ใส่ array ว่างไว้ก่อน
  MTL_RECEIVING_STAFF: [],
  // MR (Managing Representative) - ใส่ code ที่ต้องการ filter ตรงนี้
  // ถ้ายังไม่ทราบ code ให้ใส่ array ว่างไว้ก่อน
  MR: [],
};

/**
 * Filter employees ตามตำแหน่ง
 * @param employees - List ของ employees
 * @param position - ตำแหน่งที่ต้องการ filter (DI, MD, TL, IMR, DL)
 * @returns Filtered employees ที่มี title.code ตรงกับตำแหน่งที่ระบุ
 */
export function filterEmployeesByPosition(
  employees: EmployeeOption[],
  position: EmployeePosition
): EmployeeOption[] {
  const codes = POSITION_CODE_MAP[position];
  if (!codes || codes.length === 0) {
    return [];
  }

  return employees.filter(employee =>
    employee.titleCode && codes.includes(employee.titleCode)
  );
}

/**
 * Filter employees ตาม code list (ใช้ title.code)
 * @param employees - List ของ employees
 * @param codes - Array ของ code ที่ต้องการ filter
 * @returns Filtered employees ที่มี title.code ตรงกับที่ระบุ
 */
export function filterEmployeesByCodes(
  employees: EmployeeOption[],
  codes: string[]
): EmployeeOption[] {
  if (!codes || codes.length === 0) {
    return [];
  }

  return employees.filter(employee =>
    employee.titleCode && codes.includes(employee.titleCode)
  );
}

/**
 * ตรวจสอบว่า employee มีตำแหน่งตามที่ระบุหรือไม่
 * @param employee - Employee ที่ต้องการตรวจสอบ
 * @param position - ตำแหน่งที่ต้องการตรวจสอบ
 * @returns true ถ้า employee มี title.code ตรงกับตำแหน่งที่ระบุ
 */
export function hasPosition(
  employee: EmployeeOption,
  position: EmployeePosition
): boolean {
  const codes = POSITION_CODE_MAP[position];
  if (!codes || codes.length === 0) {
    return false;
  }

  return employee.titleCode ? codes.includes(employee.titleCode) : false;
}

/**
 * Get code list สำหรับตำแหน่งที่ระบุ
 * @param position - ตำแหน่งที่ต้องการ
 * @returns Array ของ code สำหรับตำแหน่งนั้น
 */
export function getCodesByPosition(position: EmployeePosition): string[] {
  return POSITION_CODE_MAP[position] || [];
}

/**
 * Filter employees ตามหลายตำแหน่งพร้อมกัน
 * @param employees - List ของ employees
 * @param positions - Array ของตำแหน่งที่ต้องการ filter (เช่น ['MD', 'DI', 'TL'])
 * @returns Filtered employees ที่มี title.code ตรงกับตำแหน่งใดตำแหน่งหนึ่งที่ระบุ
 */
export function filterEmployeesByPositions(
  employees: EmployeeOption[],
  positions: EmployeePosition[]
): EmployeeOption[] {
  if (!positions || positions.length === 0) {
    return [];
  }

  // รวม code ทั้งหมดจากทุกตำแหน่ง
  const allCodes: string[] = [];
  positions.forEach(position => {
    const codes = POSITION_CODE_MAP[position];
    if (codes && codes.length > 0) {
      allCodes.push(...codes);
    }
  });

  if (allCodes.length === 0) {
    return [];
  }

  // Filter employees ที่มี title.code อยู่ใน list
  return employees.filter(employee =>
    employee.titleCode && allCodes.includes(employee.titleCode)
  );
}


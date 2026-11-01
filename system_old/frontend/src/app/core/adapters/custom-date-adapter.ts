import { Injectable, Inject, Optional } from '@angular/core';
import { MAT_DATE_LOCALE, NativeDateAdapter } from '@angular/material/core';

/**
 * Custom DateAdapter based on NativeDateAdapter
 * - ใช้กับ MatNativeDateModule
 * - ให้ dropdown/ปฏิทินใช้ชื่อเดือนตัวย่อภาษาอังกฤษ 3 ตัว
 * - ให้ค่าที่แสดงในช่อง input เป็น dd MMM yyyy (เช่น 09 Feb 2026)
 *   โดยค่าที่เก็บจริงยังเป็น Date object ส่ง API เหมือนเดิม
 */
@Injectable()
export class CustomDateAdapter extends NativeDateAdapter {
  constructor(@Optional() @Inject(MAT_DATE_LOCALE) matDateLocale: string) {
    super(matDateLocale);
  }

  /**
   * รูปแบบที่ใช้แสดงในช่อง input ของ datepicker
   * ไม่กระทบค่า Date ที่เก็บในฟอร์ม
   */
  override format(date: Date, displayFormat: any): string {
    if (!date) {
      return '';
    }

    const day = date.getDate().toString().padStart(2, '0');
    const monthIndex = date.getMonth(); // 0-11
    const year = date.getFullYear();

    const monthAbbr = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ][monthIndex] ?? '';

    // บังคับให้แสดงเป็น dd MMM yyyy เสมอ เช่น 09 Feb 2026
    return `${day}-${monthAbbr}-${year}`;
  }

  /**
   * ชื่อเดือนใน dropdown / month view
   */
  override getMonthNames(style: 'long' | 'short' | 'narrow'): string[] {
    return [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
  }
}

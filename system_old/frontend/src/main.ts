// import { bootstrapApplication } from '@angular/platform-browser';
// import { AppComponent } from 'app/app.component';
// import { appConfig } from 'app/app.config';

// bootstrapApplication(AppComponent, appConfig).catch((err) =>
//     console.error(err)




// );

import { bootstrapApplication } from '@angular/platform-browser';
import { importProvidersFrom } from '@angular/core';
import { AppComponent } from 'app/app.component';
import { appConfig } from 'app/app.config';
import { DateAdapter, MAT_DATE_LOCALE, MAT_DATE_FORMATS, MatNativeDateModule } from '@angular/material/core';
import { CustomDateAdapter } from 'app/core/adapters/custom-date-adapter';

export const DDMMYYYY_FORMATS = {
  parse: { dateInput: 'dd/MM/yyyy' },
  display: {
    // แสดงในช่องเป็น 09 Feb 2026
    dateInput: 'dd MMM yyyy',
    monthYearLabel: 'MMM yyyy',
    dateA11yLabel: 'dd/MM/yyyy',
    monthYearA11yLabel: 'MMMM yyyy',
  },
};

bootstrapApplication(AppComponent, {
  ...appConfig,
  providers: [
    // ลำดับสำคัญ: โหลด MatNativeDateModule ก่อน แล้ว override DateAdapter ทีหลัง
    importProvidersFrom(MatNativeDateModule),
    ...(appConfig.providers || []),
    // บังคับใช้ CustomDateAdapter แทน NativeDateAdapter ทั่วแอป
    { provide: DateAdapter, useClass: CustomDateAdapter },
    { provide: MAT_DATE_LOCALE, useValue: 'en-GB' },
    { provide: MAT_DATE_FORMATS, useValue: DDMMYYYY_FORMATS },
  ],
}).catch((err) => console.error(err));

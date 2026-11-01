declare module 'ngx-toastr' {
  import { EnvironmentProviders, Provider } from '@angular/core';

  export interface IndividualConfig {
    timeOut?: number;
    positionClass?: string;
    preventDuplicates?: boolean;
    closeButton?: boolean;
    progressBar?: boolean;
  }

  export class ToastrService {
    success(message?: string, title?: string, override?: Partial<IndividualConfig>): unknown;
    error(message?: string, title?: string, override?: Partial<IndividualConfig>): unknown;
    info(message?: string, title?: string, override?: Partial<IndividualConfig>): unknown;
    warning(message?: string, title?: string, override?: Partial<IndividualConfig>): unknown;
  }

  export function provideToastr(config?: Partial<IndividualConfig>): Array<Provider | EnvironmentProviders>;
}


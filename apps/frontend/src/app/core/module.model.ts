export type ModuleStatus = 'available' | 'migration' | 'planned';
export type ModuleAccent = 'blue' | 'cyan' | 'green' | 'purple' | 'orange' | 'red';

export interface EdmsModule {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  status: ModuleStatus;
  route: string;
  accent: ModuleAccent;
  permissionPrefix: string;
  favorite?: boolean;
}

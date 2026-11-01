import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';

@Component({
  selector: 'app-legacy-source-button',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  template: `
    <button
      *ngIf="hasLegacySource"
      type="button"
      mat-flat-button
      class="!h-10 !rounded-full !bg-amber-500 !px-4 !text-white hover:!bg-amber-600"
      style="background-color: #f59e0b; color: #ffffff;"
      (click)="openLegacySource()">
      <mat-icon class="icon-size-5 mr-2">history</mat-icon>
      <span class="font-medium">View Legacy Source</span>
    </button>
  `,
})
export class LegacySourceButtonComponent {
  @Input() recordData: any;

  constructor(private router: Router) {}

  get hasLegacySource(): boolean {
    return this.legacySourcePath !== '';
  }

  private get legacySourcePath(): string {
    const source = this.recordData ?? {};
    const legacySource = source.legacy_source ?? source.legacySource ?? {};
    const explicitPath =
      this.pickString(source, 'legacyViewPath', 'legacy_view_path', 'legacy_source.legacy_view_path', 'legacySource.legacyViewPath') ??
      this.pickString(legacySource, 'legacyViewPath', 'legacy_view_path');

    if (explicitPath) {
      return explicitPath;
    }

    const isLegacy = this.asBoolean(
      this.pickValue(source, 'isLegacy', 'is_legacy', 'legacy_source.is_legacy', 'legacySource.isLegacy')
    );
    const stage = this.pickString(legacySource, 'sourceStage', 'source_stage') ?? this.pickString(source, 'stageKey');
    const sourceId = this.pickString(legacySource, 'sourceId', 'source_id');

    if (isLegacy && stage && sourceId) {
      return `/legacy-design-review/${stage}/${sourceId}`;
    }

    return '';
  }

  openLegacySource(): void {
    const path = this.legacySourcePath;
    if (!path) {
      return;
    }

    if (/^https?:\/\//i.test(path)) {
      window.open(path, '_blank', 'noopener');
      return;
    }

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = this.router.serializeUrl(this.router.createUrlTree([normalizedPath]));
    window.open(url, '_blank', 'noopener');
  }

  private pickString(source: any, ...paths: string[]): string | null {
    for (const path of paths) {
      const value = this.pickValue(source, path);
      if (typeof value === 'string' && value.trim() !== '') {
        return value.trim();
      }
      if (typeof value === 'number') {
        return String(value);
      }
    }
    return null;
  }

  private pickValue(source: any, ...paths: string[]): any {
    for (const path of paths) {
      const value = path.split('.').reduce((current, key) => current?.[key], source);
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }
    return null;
  }

  private asBoolean(value: any): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value === 1;
    }
    if (typeof value === 'string') {
      return ['1', 'true', 'yes', 'y'].includes(value.trim().toLowerCase());
    }
    return false;
  }
}

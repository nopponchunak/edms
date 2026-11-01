import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ApiConfig } from 'app/core/config/api.config';
import {
  CurrentProjectImportCreated,
  CurrentProjectImportData,
  CurrentProjectImportSummary,
  ProposalContractReviewService,
} from 'app/core/services/proposal-contract-review.service';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-proposal-contract-review-import',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    FuseAlertComponent,
  ],
  templateUrl: './proposal-contract-review-import.component.html',
  styleUrls: ['./proposal-contract-review-import.component.scss'],
})
export class ProposalContractReviewImportComponent {
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  selectedFile: File | null = null;
  isDragging = false;
  isUploading = false;
  runningAction: 'dry-run' | 'commit' | null = null;
  lastResult: CurrentProjectImportData | null = null;
  alert: { type: FuseAlertType; message: string } | null = null;

  readonly acceptedExtensions = ['xlsx', 'xls'];

  constructor(
    private router: Router,
    private fuseConfirmationService: FuseConfirmationService,
    private apiConfig: ApiConfig,
    private proposalContractReviewService: ProposalContractReviewService
  ) {}

  onBack(): void {
    this.router.navigate(['/proposal-contract-review/list']);
  }

  openFilePicker(): void {
    this.fileInput?.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.setSelectedFile(input.files?.[0] ?? null);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    this.setSelectedFile(event.dataTransfer?.files?.[0] ?? null);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
  }

  clearFile(): void {
    this.selectedFile = null;
    this.lastResult = null;
    this.alert = null;

    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
  }

  runImport(commit: boolean): void {
    if (!this.selectedFile) {
      this.alert = { type: 'warning', message: 'Please select an Excel file first.' };
      return;
    }

    if (!this.isAcceptedFile(this.selectedFile)) {
      this.alert = { type: 'error', message: 'Only .xlsx and .xls files are supported.' };
      return;
    }

    if (!this.apiConfig.isFileSizeValid(this.selectedFile.size)) {
      this.alert = { type: 'error', message: this.apiConfig.getFileSizeExceededMessage(this.selectedFile) };
      return;
    }

    if (commit) {
      this.confirmCommit();
      return;
    }

    this.executeImport(false);
  }

  private confirmCommit(): void {
    const confirmation = this.fuseConfirmationService.open({
      title: 'Commit Import',
      message: 'Please confirm before importing this file into Proposal Contract Review.',
      icon: { show: true, name: 'heroicons_outline:exclamation-triangle', color: 'warn' },
      actions: {
        cancel: { show: true, label: 'Cancel' },
        confirm: { show: true, label: 'Commit Import', color: 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result === 'confirmed') {
        this.executeImport(true);
      }
    });
  }

  private executeImport(commit: boolean): void {
    const file = this.selectedFile;

    if (!file) {
      this.alert = { type: 'warning', message: 'Please select an Excel file first.' };
      return;
    }

    this.isUploading = true;
    this.runningAction = commit ? 'commit' : 'dry-run';
    this.alert = null;

    this.proposalContractReviewService
      .importCurrentProjects(file, commit)
      .pipe(finalize(() => {
        this.isUploading = false;
        this.runningAction = null;
      }))
      .subscribe({
        next: (response) => {
          this.lastResult = response?.data ?? null;
          const hasErrors = (this.lastResult?.errors?.length ?? 0) > 0;

          this.alert = {
            type: hasErrors ? 'error' : commit ? 'success' : 'info',
            message: response?.message || (commit ? 'Import completed.' : 'Dry run completed.'),
          };
        },
        error: (err) => {
          const data = err?.error?.data;
          this.lastResult = data ?? null;
          this.alert = {
            type: 'error',
            message: err?.error?.message || 'Import failed.',
          };
        },
      });
  }

  get summaryEntries(): Array<{ label: string; value: number }> {
    const summary = this.lastResult?.summary;

    if (!summary) {
      return [];
    }

    return [
      { label: 'Proposal rows', value: this.toNumber(summary.proposal_rows) },
      { label: 'Project rows', value: this.toNumber(summary.project_rows) },
      { label: 'Reference rows', value: this.toNumber(summary.reference_rows_in_file) },
      { label: 'Proposal numbers', value: this.toNumber(summary.proposal_numbers) },
      { label: 'MT project numbers', value: this.toNumber(summary.mt_project_numbers) },
      { label: 'Linked proposals', value: this.toNumber(summary.proposals_with_projects) },
      { label: 'Existing proposals', value: this.toNumber(summary.existing_proposal_numbers) },
      { label: 'Existing MT projects', value: this.toNumber(summary.existing_mt_project_numbers) },
      { label: 'Existing references', value: this.toNumber(summary.existing_reference_project_numbers) },
    ];
  }

  get createdEntries(): Array<{ label: string; value: number }> {
    const created = this.lastResult?.created;

    if (!created) {
      return [];
    }

    return [
      { label: 'Proposals created', value: this.createdCount(created, 'proposal_contract_review_ids') },
      { label: 'Projects created', value: this.createdCount(created, 'proposal_contract_review_project_ids') },
      { label: 'References created', value: this.createdCount(created, 'proposal_project_reference_ids') },
    ];
  }

  get warnings(): string[] {
    return this.lastResult?.warnings ?? [];
  }

  get errors(): string[] {
    return this.lastResult?.errors ?? [];
  }

  formatFileSize(bytes: number): string {
    if (!bytes) {
      return '0 Bytes';
    }

    const units = ['Bytes', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);

    return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
  }

  trackByLabel(_: number, item: { label: string }): string {
    return item.label;
  }

  trackByValue(_: number, value: string): string {
    return value;
  }

  private setSelectedFile(file: File | null): void {
    if (!file) {
      return;
    }

    this.lastResult = null;

    if (!this.apiConfig.isFileSizeValid(file.size)) {
      this.selectedFile = null;
      this.alert = { type: 'error', message: this.apiConfig.getFileSizeExceededMessage(file) };
      this.resetFileInput();
      return;
    }

    this.selectedFile = file;
    this.alert = this.isAcceptedFile(file)
      ? null
      : { type: 'error', message: 'Only .xlsx and .xls files are supported.' };
  }

  private resetFileInput(): void {
    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
  }

  private isAcceptedFile(file: File): boolean {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    return this.acceptedExtensions.includes(extension);
  }

  private createdCount(created: CurrentProjectImportCreated, key: keyof CurrentProjectImportCreated): number {
    return created[key]?.length ?? 0;
  }

  private toNumber(value: CurrentProjectImportSummary[keyof CurrentProjectImportSummary]): number {
    return Number(value ?? 0);
  }
}

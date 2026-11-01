import { Component, OnInit } from '@angular/core';
import { formatDateDisplay } from 'app/core/utils/date-format.util';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';

export interface DesignVerificationValidationItem {
  id: string;
  projectName: string;
  projectNumber: string;
  verification: boolean;
  validation: boolean;
  discipline: string[];
  documentTypes: string[];
  designStage: string[];
  status: 'draft' | 'in-review' | 'responded' | 'signed' | 'acknowledged' | 'completed' | 'rejected';
  reviewedBy: string;
  reviewedByDate: Date;
  respondedBy: string;
  respondedByDate: Date;
  signedByVVE: string;
  signedByVVEDate: Date;
  signedByTL: string;
  signedByTLDate: Date;
  acknowledgedBy: string;
  acknowledgedByDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

@Component({
  selector: 'app-design-verification-validation-list',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatCardModule,
    MatChipsModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  templateUrl: './design-verification-validation-list.component.html',
  styleUrls: ['./design-verification-validation-list.component.scss']
})
export class DesignVerificationValidationListComponent implements OnInit {
  loading = false;
  currentTab = 0;
  
  // Tab counts
  allCount = 0;
  draftCount = 0;
  inReviewCount = 0;
  respondedCount = 0;
  signedCount = 0;
  acknowledgedCount = 0;
  completedCount = 0;
  rejectedCount = 0;

  // Mock data
  mockDesignVerificationValidations: DesignVerificationValidationItem[] = [
    {
      id: '1',
      projectName: 'High-Rise Office Building',
      projectNumber: 'MTL-2024-DVV-001',
      verification: true,
      validation: false,
      discipline: ['Superstructure', 'Electrical'],
      documentTypes: ['Drawings', 'Specifications'],
      designStage: ['Tender'],
      status: 'completed',
      reviewedBy: 'John Smith',
      reviewedByDate: new Date('2024-01-15'),
      respondedBy: 'Alice Brown',
      respondedByDate: new Date('2024-01-16'),
      signedByVVE: 'John Smith',
      signedByVVEDate: new Date('2024-01-17'),
      signedByTL: 'Sarah Johnson',
      signedByTLDate: new Date('2024-01-18'),
      acknowledgedBy: 'Mike Chen',
      acknowledgedByDate: new Date('2024-01-19'),
      createdAt: new Date('2024-01-10'),
      updatedAt: new Date('2024-01-19')
    },
    {
      id: '2',
      projectName: 'Residential Complex',
      projectNumber: 'MTL-2024-DVV-002',
      verification: false,
      validation: true,
      discipline: ['Foundation/Substructure', 'MVAC'],
      documentTypes: ['Reports', 'Calculations'],
      designStage: ['Construction'],
      status: 'in-review',
      reviewedBy: 'Sarah Johnson',
      reviewedByDate: new Date('2024-01-20'),
      respondedBy: 'Bob White',
      respondedByDate: new Date('2024-01-21'),
      signedByVVE: 'Sarah Johnson',
      signedByVVEDate: new Date('2024-01-22'),
      signedByTL: 'John Smith',
      signedByTLDate: new Date('2024-01-23'),
      acknowledgedBy: 'Mike Chen',
      acknowledgedByDate: new Date('2024-01-24'),
      createdAt: new Date('2024-01-15'),
      updatedAt: new Date('2024-01-24')
    },
    {
      id: '3',
      projectName: 'Shopping Mall',
      projectNumber: 'MTL-2024-DVV-003',
      verification: true,
      validation: true,
      discipline: ['Façade', 'Fire Protection'],
      documentTypes: ['Drawings', 'Reports'],
      designStage: ['Tender'],
      status: 'draft',
      reviewedBy: 'Mike Chen',
      reviewedByDate: new Date('2024-01-25'),
      respondedBy: 'Alice Brown',
      respondedByDate: new Date('2024-01-26'),
      signedByVVE: 'Mike Chen',
      signedByVVEDate: new Date('2024-01-27'),
      signedByTL: 'Sarah Johnson',
      signedByTLDate: new Date('2024-01-28'),
      acknowledgedBy: 'John Smith',
      acknowledgedByDate: new Date('2024-01-29'),
      createdAt: new Date('2024-01-20'),
      updatedAt: new Date('2024-01-29')
    }
  ];

  constructor(
    private router: Router,
    private _snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.updateTabCounts();
  }

  updateTabCounts(): void {
    this.allCount = this.mockDesignVerificationValidations.length;
    this.draftCount = this.mockDesignVerificationValidations.filter(item => item.status === 'draft').length;
    this.inReviewCount = this.mockDesignVerificationValidations.filter(item => item.status === 'in-review').length;
    this.respondedCount = this.mockDesignVerificationValidations.filter(item => item.status === 'responded').length;
    this.signedCount = this.mockDesignVerificationValidations.filter(item => item.status === 'signed').length;
    this.acknowledgedCount = this.mockDesignVerificationValidations.filter(item => item.status === 'acknowledged').length;
    this.completedCount = this.mockDesignVerificationValidations.filter(item => item.status === 'completed').length;
    this.rejectedCount = this.mockDesignVerificationValidations.filter(item => item.status === 'rejected').length;
  }

  getFilteredDesignVerificationValidations(): DesignVerificationValidationItem[] {
    switch (this.currentTab) {
      case 0: return this.mockDesignVerificationValidations;
      case 1: return this.mockDesignVerificationValidations.filter(item => item.status === 'draft');
      case 2: return this.mockDesignVerificationValidations.filter(item => item.status === 'in-review');
      case 3: return this.mockDesignVerificationValidations.filter(item => item.status === 'responded');
      case 4: return this.mockDesignVerificationValidations.filter(item => item.status === 'signed');
      case 5: return this.mockDesignVerificationValidations.filter(item => item.status === 'acknowledged');
      case 6: return this.mockDesignVerificationValidations.filter(item => item.status === 'completed');
      case 7: return this.mockDesignVerificationValidations.filter(item => item.status === 'rejected');
      default: return this.mockDesignVerificationValidations;
    }
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'in-review': return 'bg-blue-100 text-blue-800';
      case 'responded': return 'bg-yellow-100 text-yellow-800';
      case 'signed': return 'bg-purple-100 text-purple-800';
      case 'acknowledged': return 'bg-indigo-100 text-indigo-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'draft': return 'Draft';
      case 'in-review': return 'In Review';
      case 'responded': return 'Responded';
      case 'signed': return 'Signed';
      case 'acknowledged': return 'Acknowledged';
      case 'completed': return 'Completed';
      case 'rejected': return 'Rejected';
      default: return 'Unknown';
    }
  }

  getTypeLabel(verification: boolean, validation: boolean): string {
    if (verification && validation) return 'Verification & Validation';
    if (verification) return 'Verification';
    if (validation) return 'Validation';
    return 'None';
  }

  formatDate(date: Date): string {
    return formatDateDisplay(date);
  }

  navigateToNew(): void {
    this.router.navigate(['/design-verification-validation/new']);
  }

  navigateToView(id: string): void {
    this.router.navigate(['/design-verification-validation/view', id]);
  }

  navigateToEdit(id: string): void {
    this.router.navigate(['/design-verification-validation/edit', id]);
  }

  deleteDesignVerificationValidation(id: string): void {
    if (confirm('Are you sure you want to delete this design verification/validation?')) {
      const index = this.mockDesignVerificationValidations.findIndex(item => item.id === id);
      if (index > -1) {
        this.mockDesignVerificationValidations.splice(index, 1);
        this.updateTabCounts();
        this._snackBar.open('Design verification/validation deleted successfully', 'Close', { duration: 3000 });
      }
    }
  }
}

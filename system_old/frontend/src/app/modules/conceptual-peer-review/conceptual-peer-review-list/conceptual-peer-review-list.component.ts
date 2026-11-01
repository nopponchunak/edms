import { Component, OnInit, OnDestroy } from '@angular/core';
import { formatDateDisplay } from 'app/core/utils/date-format.util';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface ConceptualPeerReview {
  id: string;
  projectName: string;
  projectNumber: string;
  preparedBy: string;
  present: string;
  disciplines: string[];
  documentations: string[];
  status: 'draft' | 'in_review' | 'responded' | 'signed' | 'acknowledged' | 'completed' | 'rejected';
  reviewedBy: string;
  reviewedByDate: Date;
  respondedBy: string;
  respondedByDate: Date;
  recommendedActionsSatisfactorilyTaken: boolean;
  signedByVVE: string;
  signedByVVEDate: Date;
  signedByTL: string;
  signedByTLDate: Date;
  acknowledgedBy: string;
  acknowledgedByDate: Date;
  createdDate: Date;
  lastModified: Date;
}

@Component({
  selector: 'app-conceptual-peer-review-list',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTabsModule,
    MatCardModule,
    MatChipsModule,
    MatBadgeModule,
    MatTooltipModule
  ],
  templateUrl: './conceptual-peer-review-list.component.html',
  styleUrls: ['./conceptual-peer-review-list.component.scss']
})
export class ConceptualPeerReviewListComponent implements OnInit, OnDestroy {
  loading = false;
  currentTab = 0;
  
  // Tab counts
  draftCount = 0;
  inReviewCount = 0;
  respondedCount = 0;
  signedCount = 0;
  acknowledgedCount = 0;
  completedCount = 0;
  rejectedCount = 0;
  
  // Mock data
  reviews: ConceptualPeerReview[] = [
    {
      id: '1',
      projectName: 'High-Rise Office Building',
      projectNumber: 'MTL-2024-CPR-001',
      preparedBy: 'John Smith',
      present: 'Sarah Johnson',
      disciplines: ['Superstructure', 'Electrical'],
      documentations: ['Drawings/Sketches', 'Calculations'],
      status: 'completed',
      reviewedBy: 'Mike Chen (VVE)',
      reviewedByDate: new Date('2024-01-15'),
      respondedBy: 'John Smith (PE)',
      respondedByDate: new Date('2024-01-16'),
      recommendedActionsSatisfactorilyTaken: true,
      signedByVVE: 'Mike Chen (VVE)',
      signedByVVEDate: new Date('2024-01-17'),
      signedByTL: 'Sarah Johnson (TL)',
      signedByTLDate: new Date('2024-01-18'),
      acknowledgedBy: 'Mike Chen (DI)',
      acknowledgedByDate: new Date('2024-01-19'),
      createdDate: new Date('2024-01-10'),
      lastModified: new Date('2024-01-19')
    },
    {
      id: '2',
      projectName: 'Residential Complex',
      projectNumber: 'MTL-2024-CPR-002',
      preparedBy: 'Sarah Johnson',
      present: 'Mike Chen',
      disciplines: ['Foundation/Substructure', 'MVAC'],
      documentations: ['Reports', 'Simulation Model'],
      status: 'in_review',
      reviewedBy: 'John Smith (DL)',
      reviewedByDate: new Date('2024-01-20'),
      respondedBy: 'Sarah Johnson (PE)',
      respondedByDate: new Date('2024-01-21'),
      recommendedActionsSatisfactorilyTaken: false,
      signedByVVE: 'John Smith (DL)',
      signedByVVEDate: new Date('2024-01-22'),
      signedByTL: 'Mike Chen (TL)',
      signedByTLDate: new Date('2024-01-23'),
      acknowledgedBy: 'Sarah Johnson (DI)',
      acknowledgedByDate: new Date('2024-01-24'),
      createdDate: new Date('2024-01-15'),
      lastModified: new Date('2024-01-24')
    },
    {
      id: '3',
      projectName: 'Shopping Mall',
      projectNumber: 'MTL-2024-CPR-003',
      preparedBy: 'Mike Chen',
      present: 'John Smith',
      disciplines: ['Lighting', 'Fire Protection'],
      documentations: ['Drawings/Sketches', 'Reports'],
      status: 'draft',
      reviewedBy: 'Sarah Johnson (VVE)',
      reviewedByDate: new Date('2024-01-25'),
      respondedBy: 'Mike Chen (PE)',
      respondedByDate: new Date('2024-01-26'),
      recommendedActionsSatisfactorilyTaken: true,
      signedByVVE: 'Sarah Johnson (VVE)',
      signedByVVEDate: new Date('2024-01-27'),
      signedByTL: 'John Smith (TL)',
      signedByTLDate: new Date('2024-01-28'),
      acknowledgedBy: 'Mike Chen (DI)',
      acknowledgedByDate: new Date('2024-01-29'),
      createdDate: new Date('2024-01-20'),
      lastModified: new Date('2024-01-29')
    }
  ];

  constructor(private _router: Router, private _snackBar: MatSnackBar) {}

  ngOnInit(): void {
    this.loadReviews();
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  loadReviews(): void {
    this.loading = true;
    
    // Mock data loading
    setTimeout(() => {
      this.updateTabCounts();
      this.loading = false;
    }, 1000);
  }

  updateTabCounts(): void {
    this.draftCount = this.reviews.filter(r => r.status === 'draft').length;
    this.inReviewCount = this.reviews.filter(r => r.status === 'in_review').length;
    this.respondedCount = this.reviews.filter(r => r.status === 'responded').length;
    this.signedCount = this.reviews.filter(r => r.status === 'signed').length;
    this.acknowledgedCount = this.reviews.filter(r => r.status === 'acknowledged').length;
    this.completedCount = this.reviews.filter(r => r.status === 'completed').length;
    this.rejectedCount = this.reviews.filter(r => r.status === 'rejected').length;
  }

  navigateToNew(): void {
    this._router.navigate(['/conceptual-peer-review/new']);
  }

  navigateToEdit(id: string): void {
    this._router.navigate(['/conceptual-peer-review/edit', id]);
  }

  navigateToView(id: string): void {
    this._router.navigate(['/conceptual-peer-review/view', id]);
  }

  deleteReview(id: string): void {
    if (confirm('Are you sure you want to delete this review?')) {
      this.reviews = this.reviews.filter(review => review.id !== id);
      this.updateTabCounts();
      this._snackBar.open('Review deleted successfully', 'Close', { duration: 3000 });
    }
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'in_review': return 'bg-yellow-100 text-yellow-800';
      case 'responded': return 'bg-blue-100 text-blue-800';
      case 'signed': return 'bg-purple-100 text-purple-800';
      case 'acknowledged': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'draft': return 'Draft';
      case 'in_review': return 'In Review';
      case 'responded': return 'Responded';
      case 'signed': return 'Signed';
      case 'acknowledged': return 'Acknowledged';
      case 'completed': return 'Completed';
      case 'rejected': return 'Rejected';
      default: return 'Unknown';
    }
  }

  formatDate(date: Date): string {
    return formatDateDisplay(date);
  }

  getFilteredReviews(): ConceptualPeerReview[] {
    switch (this.currentTab) {
      case 0: return this.reviews; // All
      case 1: return this.reviews.filter(r => r.status === 'draft'); // Draft
      case 2: return this.reviews.filter(r => r.status === 'in_review'); // In Review
      case 3: return this.reviews.filter(r => r.status === 'responded'); // Responded
      case 4: return this.reviews.filter(r => r.status === 'signed'); // Signed
      case 5: return this.reviews.filter(r => r.status === 'acknowledged'); // Acknowledged
      case 6: return this.reviews.filter(r => r.status === 'completed'); // Completed
      case 7: return this.reviews.filter(r => r.status === 'rejected'); // Rejected
      default: return this.reviews;
    }
  }
}

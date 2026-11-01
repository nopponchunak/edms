import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { Subject, takeUntil } from 'rxjs';
import { formatDateDisplay } from 'app/core/utils/date-format.util';
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';

interface AdditionalDesignFee {
  id: string;
  projectName: string;
  projectNo: string;
  claimNo: string;
  date: Date;
  totalAmount: number;
  status: 'draft' | 'pending' | 'approved' | 'rejected';
  discipline: string[];
  requestedBy: {
    firstName: string;
    lastName: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

@Component({
  selector: 'app-additional-design-fees-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './additional-design-fees-list.component.html',
  styleUrls: ['./additional-design-fees-list.component.scss'],
})
export class AdditionalDesignFeesListComponent implements OnInit, OnDestroy {
  readonly navigationPermissionService = inject(NavigationPermissionService);
  readonly permissionNavId = 'additional-design-fees';

  additionalDesignFees: AdditionalDesignFee[] = [];
  loading = false;
  currentTab: 'all' | 'my' | 'pending' = 'all';
  private _unsubscribeAll: Subject<any> = new Subject<any>();

  constructor(
    private router: Router,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    if (!this.navigationPermissionService.hasViewAllPermissionByNavId(this.permissionNavId)) {
      this.currentTab = 'my';
    }

    this.loadRequests();
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  onTabChange(tab: 'all' | 'my' | 'pending'): void {
    if (tab === 'all' && !this.navigationPermissionService.hasViewAllPermissionByNavId(this.permissionNavId)) {
      tab = 'my';
    }

    this.currentTab = tab;
    this.loadRequests();
  }

  loadRequests(): void {
    this.loading = true;
    
    // Mock data for demonstration
    setTimeout(() => {
      this.additionalDesignFees = [
        {
          id: '1',
          projectName: 'New Hospital Complex - Phase 2',
          projectNo: 'MT2024001',
          claimNo: 'CLM-2024-001',
          date: new Date('2024-10-27'),
          totalAmount: 200000,
          status: 'pending',
          discipline: ['C&S'],
          requestedBy: {
            firstName: 'John',
            lastName: 'Smith'
          },
          createdAt: new Date('2024-10-27'),
          updatedAt: new Date('2024-10-27')
        },
        {
          id: '2',
          projectName: 'Office Building Renovation',
          projectNo: 'MT2024002',
          claimNo: 'CLM-2024-002',
          date: new Date('2024-10-26'),
          totalAmount: 150000,
          status: 'approved',
          discipline: ['MEP'],
          requestedBy: {
            firstName: 'Jane',
            lastName: 'Doe'
          },
          createdAt: new Date('2024-10-26'),
          updatedAt: new Date('2024-10-26')
        },
        {
          id: '3',
          projectName: 'Shopping Mall Extension',
          projectNo: 'MT2024003',
          claimNo: 'CLM-2024-003',
          date: new Date('2024-10-25'),
          totalAmount: 300000,
          status: 'draft',
          discipline: ['C&S', 'MEP'],
          requestedBy: {
            firstName: 'Bob',
            lastName: 'Johnson'
          },
          createdAt: new Date('2024-10-25'),
          updatedAt: new Date('2024-10-25')
        }
      ];
      
      this.loading = false;
    }, 1000);
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'draft':
        return 'Draft';
      case 'pending':
        return 'Pending';
      case 'approved':
        return 'Approved';
      case 'rejected':
        return 'Rejected';
      default:
        return 'Unknown';
    }
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB'
    }).format(amount);
  }

  formatDate(date: Date): string {
    return formatDateDisplay(date);
  }

  canEdit(request: AdditionalDesignFee): boolean {
    return request.status === 'draft';
  }

  canDelete(request: AdditionalDesignFee): boolean {
    return request.status === 'draft';
  }

  deleteRequest(id: string): void {
    if (confirm('Are you sure you want to delete this request?')) {
      this.additionalDesignFees = this.additionalDesignFees.filter(req => req.id !== id);
      this.snackBar.open('Request deleted successfully', 'Close', {
        duration: 3000
      });
    }
  }
}

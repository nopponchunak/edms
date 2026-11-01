import { Component, OnInit, OnDestroy } from '@angular/core';
import { formatDateDisplay } from 'app/core/utils/date-format.util';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { Subject, takeUntil } from 'rxjs';

interface DesignChangesNotification {
  id: string;
  projectName: string;
  projectNo: string;
  changeNo: string;
  date: Date;
  status: 'draft' | 'pending' | 'approved' | 'rejected';
  to: string;
  from: string;
  changeOriginatedBy: string[];
  proceedWithChange: 'yes' | 'no' | '';
  clientAcknowledgement: 'yes' | 'no' | '';
  createdAt: Date;
  updatedAt: Date;
}

@Component({
  selector: 'app-design-changes-notification-list',
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
  templateUrl: './design-changes-notification-list.component.html',
  styleUrls: ['./design-changes-notification-list.component.scss'],
})
export class DesignChangesNotificationListComponent implements OnInit, OnDestroy {
  designChangesNotifications: DesignChangesNotification[] = [];
  loading = false;
  currentTab = 'all'; // 'all', 'my', 'pending'
  private _unsubscribeAll: Subject<any> = new Subject<any>();

  constructor(
    private router: Router,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.loadRequests();
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  onTabChange(tab: string): void {
    this.currentTab = tab;
    this.loadRequests();
  }

  loadRequests(): void {
    this.loading = true;
    
    // Mock data for demonstration
    setTimeout(() => {
      this.designChangesNotifications = [
        {
          id: '1',
          projectName: 'New Hospital Complex - Phase 2',
          projectNo: 'MT2024001',
          changeNo: 'CHG-2024-001',
          date: new Date('2024-10-27'),
          status: 'pending',
          to: 'John Smith (Team Leader)',
          from: 'Bob Johnson (Project Engineer)',
          changeOriginatedBy: ['Client', 'Meinhardt'],
          proceedWithChange: 'yes',
          clientAcknowledgement: 'yes',
          createdAt: new Date('2024-10-27'),
          updatedAt: new Date('2024-10-27')
        },
        {
          id: '2',
          projectName: 'Office Building Renovation',
          projectNo: 'MT2024002',
          changeNo: 'CHG-2024-002',
          date: new Date('2024-10-26'),
          status: 'approved',
          to: 'Jane Doe (Director)',
          from: 'Alice Brown (Senior Engineer)',
          changeOriginatedBy: ['Sub-consultant'],
          proceedWithChange: 'no',
          clientAcknowledgement: 'no',
          createdAt: new Date('2024-10-26'),
          updatedAt: new Date('2024-10-26')
        },
        {
          id: '3',
          projectName: 'Shopping Mall Extension',
          projectNo: 'MT2024003',
          changeNo: 'CHG-2024-003',
          date: new Date('2024-10-25'),
          status: 'draft',
          to: 'Diana Davis (Team Leader)',
          from: 'Eve Miller (Project Engineer)',
          changeOriginatedBy: ['Contractor'],
          proceedWithChange: '',
          clientAcknowledgement: '',
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

  formatDate(date: Date): string {
    return formatDateDisplay(date);
  }

  canEdit(request: DesignChangesNotification): boolean {
    return request.status === 'draft';
  }

  canDelete(request: DesignChangesNotification): boolean {
    return request.status === 'draft';
  }

  deleteRequest(id: string): void {
    if (confirm('Are you sure you want to delete this request?')) {
      this.designChangesNotifications = this.designChangesNotifications.filter(req => req.id !== id);
      this.snackBar.open('Request deleted successfully', 'Close', {
        duration: 3000
      });
    }
  }
}

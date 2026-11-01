import { Component, OnInit } from '@angular/core';
import { formatDateDisplay } from 'app/core/utils/date-format.util';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { Router } from '@angular/router';

interface ProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  employeeId: string;
  department: string;
  position: string;
  location: string;
  startDate: string;
  manager: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  bio: string;
  skills: string[];
  certifications: string[];
  notes: string;
  avatar?: string;
}

@Component({
  selector: 'app-profile-view',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatChipsModule
  ],
  templateUrl: './profile-view.component.html',
  styleUrls: ['./profile-view.component.scss']
})
export class ProfileViewComponent implements OnInit {
  profile: ProfileData | null = null;
  isLoading = true;

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.loadProfile();
  }

  loadProfile(): void {
    // Simulate API call
    setTimeout(() => {
      this.profile = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@meinhardt.com',
        phone: '+66-2-123-4567',
        dateOfBirth: '1985-06-15',
        address: '123 Sukhumvit Road, Bangkok 10110',
        employeeId: 'EMP001',
        department: 'Civil & Structural Engineering',
        position: 'Senior Engineer',
        location: 'Bangkok Office',
        startDate: '2020-01-15',
        manager: 'Jane Smith',
        emergencyContactName: 'Mary Doe',
        emergencyContactPhone: '+66-2-987-6543',
        emergencyContactRelation: 'Spouse',
        bio: 'Experienced civil engineer with 10+ years in structural design and project management. Specialized in high-rise buildings and infrastructure projects.',
        skills: ['AutoCAD', 'Revit', 'ETABS', 'SAP2000', 'Project Management', 'Structural Design'],
        certifications: ['P.E. License', 'PMP Certification', 'LEED AP', 'ISO 9001 Lead Auditor'],
        notes: 'Available for international projects. Fluent in English and Thai.',
        avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face'
      };
      this.isLoading = false;
    }, 1000);
  }

  onEdit(): void {
    this.router.navigate(['/profile/edit/1']);
  }

  onBack(): void {
    this.router.navigate(['/']);
  }

  formatDate(dateString: string): string {
    return formatDateDisplay(dateString);
  }

  getInitials(firstName: string, lastName: string): string {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  }
}

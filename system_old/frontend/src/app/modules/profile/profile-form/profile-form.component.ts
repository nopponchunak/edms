import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-profile-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatSelectModule,
    MatCardModule,
    MatDividerModule,
    MatSnackBarModule
  ],
  templateUrl: './profile-form.component.html',
  styleUrls: ['./profile-form.component.scss']
})
export class ProfileFormComponent implements OnInit {
  form: FormGroup;
  isEditMode = false;
  profileId: string | null = null;

  // Mock data for dropdowns
  departments = [
    'Civil & Structural Engineering',
    'Mechanical Engineering',
    'Electrical Engineering',
    'Project Management',
    'Quality Assurance',
    'Administration'
  ];

  positions = [
    'Project Engineer',
    'Senior Engineer',
    'Team Lead',
    'Director',
    'Project Manager',
    'Quality Manager',
    'Administrator'
  ];

  locations = [
    'Bangkok Office',
    'Chiang Mai Office',
    'Phuket Office',
    'Remote Work'
  ];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private snackBar: MatSnackBar,
    private fuseConfirmationService: FuseConfirmationService,
    private toastr: ToastrService
  ) {
    this.form = this.createForm();
  }

  ngOnInit(): void {
    // Check if we're in edit mode
    const url = this.router.url;
    if (url.includes('/edit/')) {
      this.isEditMode = true;
      this.profileId = url.split('/edit/')[1];
      this.loadProfileData();
    }
  }

  createForm(): FormGroup {
    return this.fb.group({
      // Personal Information
      firstName: ['', [Validators.required, Validators.minLength(2)]],
      lastName: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.required, Validators.pattern(/^[0-9+\-\s()]+$/)]],
      dateOfBirth: [''],
      address: [''],

      // Professional Information
      employeeId: ['', [Validators.required]],
      department: ['', [Validators.required]],
      position: ['', [Validators.required]],
      location: ['', [Validators.required]],
      startDate: ['', [Validators.required]],
      manager: [''],

      // Emergency Contact
      emergencyContactName: [''],
      emergencyContactPhone: [''],
      emergencyContactRelation: [''],

      // Additional Information
      bio: [''],
      skills: [''],
      certifications: [''],
      notes: ['']
    });
  }

  loadProfileData(): void {
    // Mock profile data
    const mockProfile = {
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
      bio: 'Experienced civil engineer with 10+ years in structural design and project management.',
      skills: 'AutoCAD, Revit, ETABS, SAP2000, Project Management',
      certifications: 'P.E. License, PMP Certification, LEED AP',
      notes: 'Available for international projects'
    };

    this.form.patchValue(mockProfile);
  }

  onSubmit(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      this.toastr.error('Please fill in all required fields');
      return;
    }

    const confirmation = this.fuseConfirmationService.open({
      title: this.isEditMode ? 'Confirm update' : 'Confirm submit',
      message: this.isEditMode
        ? 'Are you sure you want to update this profile?'
        : 'Are you sure you want to create this profile?',
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        cancel: { show: true, label: 'Cancel' },
        confirm: { show: true, label: this.isEditMode ? 'Update' : 'Create', color: 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;
      this.submitForm();
    });
  }

  private submitForm(): void {
    if (this.isEditMode) {
      this.toastr.success('Profile updated successfully!');
    } else {
      this.toastr.success('Profile created successfully!');
    }

    this.router.navigate(['/profile']);
  }

  onCancel(): void {
    this.router.navigate(['/profile']);
  }

  onBack(): void {
    this.router.navigate(['/profile']);
  }
}

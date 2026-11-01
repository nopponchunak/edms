export interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string;
    role: UserRole;
    isActive: boolean;
    avatar?: string;
    status?: 'online' | 'away' | 'busy' | 'not-visible';
    createdAt?: Date;
    updatedAt?: Date;
}

export enum UserRole {
    ADMIN = 'admin',
    USER = 'user',
    DOCTOR = 'doctor',
    NURSE = 'nurse',
}

export interface RegisterRequest {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string;
    role?: UserRole;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface AuthResponse {
    access_token: string;
    user: User;
}


/**
 * Authentication Types and Interfaces
 * Types for user profile, authentication state, and session tokens.
 */

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export interface AuthSession {
  user: AuthUser | null;
  isAuthenticated: boolean;
}

export interface GoogleTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  token_type?: string | null;
  scope?: string | null;
}

export interface ServerSession {
  id: string;
  user: AuthUser;
  tokens: GoogleTokens;
  createdAt: number;
  updatedAt: number;
}

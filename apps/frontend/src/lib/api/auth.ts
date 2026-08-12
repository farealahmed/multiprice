import { apiFetch } from './client';
import type { LoginInput, SessionUser, SignupInput } from './types/auth';

const jsonRequest = (input: SignupInput | LoginInput): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(input),
});

export function signup(input: SignupInput): Promise<SessionUser> {
  return apiFetch<SessionUser>('/auth/signup', jsonRequest(input));
}

export function login(input: LoginInput): Promise<SessionUser> {
  return apiFetch<SessionUser>('/auth/login', jsonRequest(input));
}

export async function logout(): Promise<void> {
  await apiFetch<void>('/auth/logout', { method: 'POST' });
}

export function me(): Promise<SessionUser> {
  return apiFetch<SessionUser>('/auth/me');
}

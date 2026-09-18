import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { User } from './models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  readonly user = signal<User | null>(null);
  readonly companyId = computed(() => this.user()?.memberships[0]?.company_id ?? null);
  readonly role = computed(() => this.user()?.memberships[0]?.role ?? null);

  login(email: string, password: string): Observable<{ user: User }> {
    return this.http
      .post<{ user: User }>('/api/v1/auth/login', { email, password }, { withCredentials: true })
      .pipe(tap(({ user }) => this.user.set(user)));
  }

  loadUser(): Observable<User> {
    return this.http
      .get<User>('/api/v1/me', { withCredentials: true })
      .pipe(tap((user) => this.user.set(user)));
  }

  logout(): Observable<void> {
    return this.http
      .post<void>('/api/v1/auth/logout', {}, { withCredentials: true })
      .pipe(tap(() => this.user.set(null)));
  }
}

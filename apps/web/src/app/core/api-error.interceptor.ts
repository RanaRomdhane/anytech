import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, finalize, Observable, shareReplay, switchMap, throwError } from 'rxjs';
import { User } from './models';
import { AuthService } from './auth.service';

let refreshRequest: Observable<{ user: User }> | null = null;

export const apiErrorInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  return next(request).pipe(
    catchError((response) => {
      if (
        response instanceof HttpErrorResponse &&
        response.status === 401 &&
        !request.url.includes('/api/v1/auth/')
      ) {
        refreshRequest ??= auth.refresh().pipe(
          finalize(() => (refreshRequest = null)),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
        return refreshRequest.pipe(
          switchMap(() => next(request.clone({ withCredentials: true }))),
          catchError((refreshError) => {
            auth.clear();
            return throwError(() => refreshError);
          }),
        );
      }
      const message = response.error?.error?.message || response.error?.detail || 'Une erreur est survenue.';
      return throwError(() => new Error(message));
    }),
  );
};

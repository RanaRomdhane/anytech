import { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

export const apiErrorInterceptor: HttpInterceptorFn = (request, next) =>
  next(request).pipe(
    catchError((response) => {
      const message = response.error?.error?.message || response.error?.detail || 'Une erreur est survenue.';
      return throwError(() => new Error(message));
    }),
  );

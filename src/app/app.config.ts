import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  isDevMode,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';

import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { AuthService } from './data/services/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAnimationsAsync(),
    // theme: 'none' — unstyled mode. Components ship no built-in CSS; styling is done
    // entirely with this project's existing Tailwind design tokens (see tailwindcss-primeui
    // in styles.scss), keeping one consistent visual language instead of a second theme.
    providePrimeNG({ theme: 'none' }),
    provideAppInitializer(() => {
      const authService = inject(AuthService);
      authService.registerActivityListeners();
      return authService.restoreSession();
    }),
    provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000'
          }), provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000'
          })
  ]
};

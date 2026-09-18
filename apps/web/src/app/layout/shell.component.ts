import { Component, computed, inject, signal } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-shell',
  imports: [MatProgressBarModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="app-shell" [attr.dir]="direction()">
      <a class="skip-link" href="#main-content">Aller au contenu principal</a>
      <aside class="sidebar" [class.open]="mobileMenu()" aria-label="Navigation principale">
        <a class="brand" routerLink="/dashboard" aria-label="AnyTech — Accueil">
          <img src="anytech-logo-transparent.png" alt="" />
        </a>

        <div class="workspace-switcher">
          <span class="workspace-mark">AT</span>
          <span><strong>AnyTech Demo</strong><small>Espace principal</small></span>
          <span class="chevron" aria-hidden="true">⌄</span>
        </div>

        <nav (click)="mobileMenu.set(false)">
          <p class="nav-label">Opérations</p>
          @for (item of primaryNavigation; track item.path) {
            <a class="nav-item" [routerLink]="item.path" routerLinkActive="active">
              <span class="nav-icon" [attr.data-icon]="item.icon" aria-hidden="true"></span>
              <span>{{ item.label }}</span>
              @if (item.badge) { <span class="nav-badge">{{ item.badge }}</span> }
            </a>
          }
          <p class="nav-label admin-label">Pilotage</p>
          @for (item of adminNavigation; track item.path) {
            <a class="nav-item" [routerLink]="item.path" routerLinkActive="active">
              <span class="nav-icon" [attr.data-icon]="item.icon" aria-hidden="true"></span>
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>

        <div class="sidebar-footer">
          <div class="quota-head"><span>Budget IA mensuel</span><strong>0 %</strong></div>
          <mat-progress-bar mode="determinate" value="0" aria-label="Budget IA utilisé : 0 %" />
          <small>Connectez un modèle pour démarrer le suivi</small>
          <button class="profile" type="button" aria-label="Se déconnecter" (click)="logout()">
            <span class="avatar">{{ initials() }}</span>
            <span><strong>{{ auth.user()?.full_name }}</strong><small>{{ roleLabel() }}</small></span>
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </aside>
      @if (mobileMenu()) { <button class="sidebar-backdrop" aria-label="Fermer le menu" (click)="mobileMenu.set(false)"></button> }

      <section class="main-column">
        <header class="topbar">
          <button class="menu-button" type="button" aria-label="Ouvrir le menu" (click)="mobileMenu.set(true)">☰</button>
          <label class="search">
            <span class="nav-icon" data-icon="search" aria-hidden="true"></span>
            <span class="sr-only">Rechercher</span>
            <input type="search" placeholder="Rechercher une conversation, commande, client…" />
            <kbd>Ctrl K</kbd>
          </label>
          <div class="top-actions">
            <button class="language" type="button" (click)="toggleLocale()" [attr.aria-label]="'Langue ' + locale()">{{ locale() }}</button>
            <button class="icon-button notification" type="button" aria-label="Notifications"><span class="nav-icon" data-icon="bell"></span><i></i></button>
            <a class="primary-action" routerLink="/orders"><span aria-hidden="true">＋</span> Nouvelle commande</a>
          </div>
        </header>
        <main id="main-content" tabindex="-1"><router-outlet /></main>
      </section>
    </div>
  `,
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly locale = signal<'FR' | 'AR'>('FR');
  protected readonly mobileMenu = signal(false);
  protected readonly direction = computed(() => (this.locale() === 'AR' ? 'rtl' : 'ltr'));
  protected readonly initials = computed(() =>
    (this.auth.user()?.full_name ?? 'AnyTech')
      .split(' ')
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase(),
  );
  protected readonly roleLabel = computed(() =>
    this.auth.role() === 'company_admin' ? 'Administratrice' : 'Agent',
  );
  protected readonly primaryNavigation = [
    { label: 'Vue d’ensemble', path: '/dashboard', icon: 'grid' },
    { label: 'Boîte de réception', path: '/inbox', icon: 'message', badge: 3 },
    { label: 'Commandes', path: '/orders', icon: 'bag' },
    { label: 'Catalogue', path: '/catalog', icon: 'box' },
    { label: 'Clients', path: '/customers', icon: 'users' },
    { label: 'Livraisons', path: '/deliveries', icon: 'truck' },
  ];
  protected readonly adminNavigation = [
    { label: 'Agents IA', path: '/ai', icon: 'sparkles' },
    { label: 'Analytiques', path: '/analytics', icon: 'chart' },
    { label: 'Intégrations', path: '/integrations', icon: 'link' },
    { label: 'Équipe', path: '/team', icon: 'users' },
    { label: 'Paramètres', path: '/settings', icon: 'settings' },
  ];

  protected toggleLocale(): void {
    this.locale.update((locale) => (locale === 'FR' ? 'AR' : 'FR'));
  }

  protected logout(): void {
    this.auth.logout().subscribe(() => this.router.navigateByUrl('/login'));
  }
}

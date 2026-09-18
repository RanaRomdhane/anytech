import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
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

        <div class="workspace-card">
          <span class="workspace-mark">{{ companyInitials() }}</span>
          <span><strong>{{ companyName() }}</strong><small>Commerce social</small></span>
          <i aria-hidden="true"></i>
        </div>

        <nav (click)="mobileMenu.set(false)">
          <p class="nav-label">Opérations</p>
          @for (item of primaryNavigation; track item.path) {
            <a class="nav-item" [routerLink]="item.path" routerLinkActive="active">
              <span class="nav-icon" [attr.data-icon]="item.icon" aria-hidden="true"></span>
              <span>{{ item.label }}</span>
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
          <div class="quota-head"><span>Budget IA mensuel</span><strong>{{ aiUsage() }} %</strong></div>
          <mat-progress-bar mode="determinate" [value]="aiUsage()" [attr.aria-label]="'Budget IA utilisé : ' + aiUsage() + ' %'" />
          <small>{{ aiConnected() ? 'Consommation du mois en cours' : 'Assistant IA non connecté' }}</small>
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
          <div class="topbar-context"><span></span><strong>{{ companyName() }}</strong><small>Connecté</small></div>
          <div class="top-actions">
            <button class="language" type="button" (click)="toggleLocale()" [attr.aria-label]="'Langue ' + locale()">{{ locale() }}</button>
            <a class="primary-action" routerLink="/orders" [queryParams]="{ create: 1 }"><span aria-hidden="true">＋</span> Nouvelle commande</a>
          </div>
        </header>
        <main id="main-content" tabindex="-1"><router-outlet /></main>
      </section>
    </div>
  `,
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  protected readonly locale = signal<'FR' | 'AR'>('FR');
  protected readonly mobileMenu = signal(false);
  protected readonly direction = computed(() => (this.locale() === 'AR' ? 'rtl' : 'ltr'));
  protected readonly companyName = this.auth.workspaceName;
  protected readonly aiConnected = signal(false);
  protected readonly aiUsage = signal(0);
  protected readonly companyInitials = computed(() =>
    this.companyName()
      .split(' ')
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase(),
  );
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
    { label: 'Boîte de réception', path: '/inbox', icon: 'message' },
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

  constructor() {
    forkJoin({ company: this.api.company(), ai: this.api.aiStatus() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ company, ai }) => {
        this.auth.workspaceName.set(company.name);
        this.aiConnected.set(ai.configured);
        this.aiUsage.set(
          ai.monthly_budget_minor > 0
            ? Math.min(100, Math.round((ai.spent_minor / ai.monthly_budget_minor) * 100))
            : 0,
        );
      });
  }

  protected toggleLocale(): void {
    this.locale.update((locale) => (locale === 'FR' ? 'AR' : 'FR'));
  }

  protected logout(): void {
    this.auth.logout().subscribe(() => this.router.navigateByUrl('/login'));
  }
}

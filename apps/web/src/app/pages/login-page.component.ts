import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule],
  template: `
    <main class="login-page">
      <section class="login-story" aria-label="Présentation AnyTech">
        <a class="login-brand" href="/">
          <img src="anytech-logo-transparent.png" alt="AnyTech" />
        </a>
        <div class="story-copy">
          <span class="story-pill">Commerce conversationnel, maîtrisé</span>
          <h1>Chaque conversation peut devenir une commande.</h1>
          <p>Centralisez WhatsApp, gardez la main sur l’IA et suivez chaque vente jusqu’à la livraison.</p>
          <ul>
            <li><span>✓</span> Prix et stock toujours validés par le système</li>
            <li><span>✓</span> Reprise humaine instantanée</li>
            <li><span>✓</span> Conçu pour le français, l’arabe et la Derja</li>
          </ul>
        </div>
        <div class="story-orbit orbit-one"></div><div class="story-orbit orbit-two"></div>
      </section>
      <section class="login-panel">
        <div class="login-card">
          <header><span class="eyebrow">Bienvenue</span><h2>Connectez-vous à votre espace</h2><p>Gérez vos conversations, commandes et livraisons depuis un seul endroit.</p></header>
          <form [formGroup]="form" (ngSubmit)="submit()">
            <label>Adresse e-mail<input type="email" formControlName="email" autocomplete="email" /></label>
            <label>Mot de passe<input type="password" formControlName="password" autocomplete="current-password" /></label>
            @if (error()) { <p class="form-error" role="alert">{{ error() }}</p> }
            <button class="primary-button login-submit" type="submit" [disabled]="form.invalid || loading()">
              {{ loading() ? 'Connexion…' : 'Se connecter' }} <span aria-hidden="true">→</span>
            </button>
          </form>
          <small class="login-legal">Accès réservé aux équipes autorisées de votre espace AnyTech.</small>
        </div>
      </section>
    </main>
  `,
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  protected submit(): void {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set('');
    this.auth
      .login(this.form.controls.email.value, this.form.controls.password.value)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({ next: () => this.router.navigateByUrl('/dashboard'), error: (error) => this.error.set(error.message) });
  }
}

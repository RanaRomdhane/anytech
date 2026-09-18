import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { AuthService } from './auth.service';
import { Conversation, Order, Product } from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private companyPath(path: string): string {
    const companyId = this.auth.companyId();
    if (!companyId) throw new Error('Aucun espace de travail actif.');
    return `/api/v1/companies/${companyId}${path}`;
  }

  products() {
    return this.http.get<{ items: Product[] }>(this.companyPath('/products'), { withCredentials: true });
  }

  createProduct(payload: {
    name: string;
    description: string;
    variant: { sku: string; price_minor: number; stock_on_hand: number; attributes: Record<string, string> };
  }) {
    return this.http.post<Product>(this.companyPath('/products'), payload, { withCredentials: true });
  }

  conversations() {
    return this.http.get<Conversation[]>(this.companyPath('/conversations'), { withCredentials: true });
  }

  changeConversationMode(conversation: Conversation, action: 'takeover' | 'return-to-ai') {
    return this.http.post<Conversation>(
      this.companyPath(`/conversations/${conversation.id}/${action}`),
      { expected_version: conversation.version },
      { withCredentials: true },
    );
  }

  orders() {
    return this.http.get<Order[]>(this.companyPath('/orders'), { withCredentials: true });
  }
}

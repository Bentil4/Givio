import { InjectionToken } from '@angular/core';
import { Account, Client } from 'appwrite';
import { environment } from '../../../environments/environment';

export const client = new Client()
  .setEndpoint(environment.appwriteEndpoint)
  .setProject(environment.appwriteProjectId);

export const ACCOUNT = new InjectionToken<Account>('ACCOUNT', {
  providedIn: 'root',
  factory: () => new Account(client),
});

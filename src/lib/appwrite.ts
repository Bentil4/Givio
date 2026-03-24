import { Client, Account} from 'appwrite';

export const client = new Client();

client
  .setEndpoint('https://fra.cloud.appwrite.io/v1')
  .setProject('69c270d10029e7ed7f82'); // Replace with your project ID

export const account = new Account(client);
export { ID } from 'appwrite';

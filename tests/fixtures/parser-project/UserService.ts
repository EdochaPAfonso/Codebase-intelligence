import { AuthService } from './AuthService.js';

export interface IUser {
  id: string;
}

export class UserService implements IUser {
  public id = "1";
  constructor(private auth: AuthService) {}

  public getUser(): string {
    return "user";
  }
}

export const defaultUser = new UserService(new AuthService());

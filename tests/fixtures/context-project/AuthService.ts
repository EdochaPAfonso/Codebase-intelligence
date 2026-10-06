export class AuthService {
  async validate(email: string): Promise<boolean> {
    return email.includes('@');
  }

  async generateToken(userId: string): Promise<string> {
    return `token-${userId}`;
  }
}

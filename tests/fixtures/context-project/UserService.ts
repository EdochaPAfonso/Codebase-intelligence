import { AuthService } from './AuthService.js';
import { PrismaService } from './PrismaService.js';

export interface CreateUserDto {
  name: string;
  email: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export class UserService {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  async createUser(dto: CreateUserDto): Promise<User> {
    const isValid = await this.auth.validate(dto.email);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }
    return this.prisma.create(dto);
  }

  async findUser(id: string): Promise<User | null> {
    return this.prisma.findById(id);
  }

  async deleteUser(id: string): Promise<void> {
    await this.prisma.delete(id);
  }
}

export function buildUser(name: string, email: string): CreateUserDto {
  return { name, email };
}

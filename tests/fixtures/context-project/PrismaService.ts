import type { CreateUserDto, User } from './UserService.js';

export class PrismaService {
  async create(dto: CreateUserDto): Promise<User> {
    return { id: 'id-1', ...dto };
  }

  async findById(id: string): Promise<User | null> {
    return id ? { id, name: 'Test', email: 'test@test.com' } : null;
  }

  async delete(id: string): Promise<void> {
    // no-op in fixture
  }
}

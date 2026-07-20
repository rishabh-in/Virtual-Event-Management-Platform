import { Injectable } from '@nestjs/common';
import type { User } from '../domain/user';
import { DuplicateUserEmailError } from '../errors/duplicate-user-email.error';
import type { UserRepository } from './user.repository.interface';

@Injectable()
export class InMemoryUserRepository implements UserRepository {
  private readonly usersById = new Map<string, User>();
  private readonly userIdsByEmail = new Map<string, string>();

  create(user: User): Promise<User> {
    const normalizedEmail = user.email.toLowerCase();

    if (this.userIdsByEmail.has(normalizedEmail)) {
      throw new DuplicateUserEmailError(normalizedEmail);
    }

    const storedUser = this.cloneUser({
      ...user,
      email: normalizedEmail,
    });

    this.usersById.set(storedUser.id, storedUser);
    this.userIdsByEmail.set(normalizedEmail, storedUser.id);

    return Promise.resolve(this.cloneUser(storedUser));
  }

  findById(id: string): Promise<User | null> {
    const user = this.usersById.get(id);

    return Promise.resolve(user ? this.cloneUser(user) : null);
  }

  findByIds(ids: string[]): Promise<User[]> {
    const users = ids
      .map((id) => this.usersById.get(id))
      .filter((user): user is User => user !== undefined)
      .map((user) => this.cloneUser(user));

    return Promise.resolve(users);
  }

  findByEmail(email: string): Promise<User | null> {
    const userId = this.userIdsByEmail.get(email.toLowerCase());

    if (!userId) {
      return Promise.resolve(null);
    }

    const user = this.usersById.get(userId);

    return Promise.resolve(user ? this.cloneUser(user) : null);
  }

  clear(): void {
    this.usersById.clear();
    this.userIdsByEmail.clear();
  }

  private cloneUser(user: User): User {
    return {
      ...user,
      createdAt: new Date(user.createdAt),
    };
  }
}

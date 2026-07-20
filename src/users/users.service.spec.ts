import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../common/enums/user-role.enum';
import { User } from './domain/user';
import { RegisterUserDto } from './dto/register-user.dto';
import { UserRepository } from './repositories/user.repository.interface';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let users: User[];
  let repository: jest.Mocked<UserRepository>;

  const createRegisterDto = (
    overrides: Partial<RegisterUserDto> = {},
  ): RegisterUserDto => ({
    name: 'Test User',
    email: 'test@example.com',
    password: 'Password123!',
    role: UserRole.ATTENDEE,
    ...overrides,
  });

  beforeEach(() => {
    users = [];
    repository = {
      create: jest.fn((user: User) => {
        users.push(user);
        return Promise.resolve({
          ...user,
          createdAt: new Date(user.createdAt),
        });
      }),
      findByEmail: jest.fn((email: string) => {
        return Promise.resolve(
          users.find((user) => user.email === email.toLowerCase()) ?? null,
        );
      }),
      findById: jest.fn((id: string) => {
        return Promise.resolve(users.find((user) => user.id === id) ?? null);
      }),
      findByIds: jest.fn((ids: string[]) => {
        return Promise.resolve(users.filter((user) => ids.includes(user.id)));
      }),
    };

    const configService = {
      getOrThrow: jest.fn(() => 4),
    } as unknown as ConfigService;

    service = new UsersService(repository, configService);
  });

  it('registers a user with a hashed password', async () => {
    const response = await service.register(createRegisterDto());
    const storedUser = users[0];

    expect(response).toMatchObject({
      id: expect.any(String) as string,
      name: 'Test User',
      email: 'test@example.com',
      role: UserRole.ATTENDEE,
      createdAt: expect.any(String) as string,
    });
    expect(response).not.toHaveProperty('passwordHash');
    expect(storedUser.passwordHash).not.toBe('Password123!');
    await expect(
      bcrypt.compare('Password123!', storedUser.passwordHash),
    ).resolves.toBe(true);
  });

  it('normalizes email addresses before storing and querying', async () => {
    await service.register(
      createRegisterDto({
        email: '  MIXED@example.COM  ',
        name: '  Mixed User  ',
      }),
    );

    expect(repository.findByEmail.mock.calls).toContainEqual([
      'mixed@example.com',
    ]);
    expect(users[0]).toMatchObject({
      email: 'mixed@example.com',
      name: 'Mixed User',
    });
  });

  it('rejects duplicate email addresses', async () => {
    await service.register(createRegisterDto());

    await expect(
      service.register(
        createRegisterDto({
          email: 'TEST@example.com',
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

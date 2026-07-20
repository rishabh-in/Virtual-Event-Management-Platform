import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../common/enums/user-role.enum';
import { User } from '../users/domain/user';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<Pick<UsersService, 'findByEmail'>>;
  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync'>>;
  let user: User;

  beforeEach(async () => {
    user = {
      id: '6b2ea113-4c74-4de1-937e-d178315c393c',
      name: 'Login User',
      email: 'login@example.com',
      passwordHash: await bcrypt.hash('Password123!', 4),
      role: UserRole.ATTENDEE,
      createdAt: new Date(),
    };

    usersService = {
      findByEmail: jest.fn(() => Promise.resolve(user)),
    };

    jwtService = {
      signAsync: jest.fn(() => Promise.resolve('signed.jwt.token')),
    };

    service = new AuthService(
      usersService as UsersService,
      jwtService as JwtService,
    );
  });

  it('returns an access token and safe user response for valid credentials', async () => {
    const response = await service.login({
      email: 'LOGIN@example.com',
      password: 'Password123!',
    });

    expect(usersService.findByEmail.mock.calls).toContainEqual([
      'LOGIN@example.com',
    ]);
    expect(jwtService.signAsync.mock.calls).toContainEqual([
      {
        sub: user.id,
        role: UserRole.ATTENDEE,
      },
    ]);
    expect(response).toEqual({
      accessToken: 'signed.jwt.token',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
    expect(response.user).not.toHaveProperty('passwordHash');
  });

  it('rejects an incorrect password', async () => {
    await expect(
      service.login({
        email: 'login@example.com',
        password: 'WrongPassword',
      }),
    ).rejects.toMatchObject({
      status: 401,
    });
  });

  it('rejects an unknown email', async () => {
    usersService.findByEmail.mockResolvedValue(null);

    await expect(
      service.login({
        email: 'missing@example.com',
        password: 'Password123!',
      }),
    ).rejects.toMatchObject({
      status: 401,
    });
  });
});

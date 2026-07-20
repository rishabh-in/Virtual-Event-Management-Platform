import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { RegisterUserDto } from './dto/register-user.dto';
import { toUserResponse } from './dto/user-response.dto';
import type { UserResponseDto } from './dto/user-response.dto';
import type { User } from './domain/user';
import { DuplicateUserEmailError } from './errors/duplicate-user-email.error';
import { USER_REPOSITORY } from './repositories/user.repository.interface';
import type { UserRepository } from './repositories/user.repository.interface';

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly configService: ConfigService,
  ) {}

  async register(registerUserDto: RegisterUserDto): Promise<UserResponseDto> {
    const email = this.normalizeEmail(registerUserDto.email);
    const existingUser = await this.userRepository.findByEmail(email);

    if (existingUser) {
      throw new ConflictException({
        code: 'USER_EMAIL_ALREADY_EXISTS',
        message: 'A user with this email already exists',
      });
    }

    const passwordHash = await bcrypt.hash(
      registerUserDto.password,
      this.configService.getOrThrow<number>('auth.bcryptSaltRounds'),
    );

    const now = new Date();
    const user: User = {
      id: randomUUID(),
      name: registerUserDto.name.trim(),
      email,
      passwordHash,
      role: registerUserDto.role,
      createdAt: now,
    };

    try {
      return toUserResponse(await this.userRepository.create(user));
    } catch (error) {
      if (error instanceof DuplicateUserEmailError) {
        throw new ConflictException({
          code: 'USER_EMAIL_ALREADY_EXISTS',
          message: 'A user with this email already exists',
        });
      }

      throw error;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(this.normalizeEmail(email));
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  async findByIds(ids: string[]): Promise<User[]> {
    return this.userRepository.findByIds(ids);
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}

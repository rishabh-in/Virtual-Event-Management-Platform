import { Body, Controller, Post } from '@nestjs/common';
import { RegisterUserDto } from './dto/register-user.dto';
import type { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('register')
  register(@Body() registerUserDto: RegisterUserDto): Promise<UserResponseDto> {
    return this.usersService.register(registerUserDto);
  }
}

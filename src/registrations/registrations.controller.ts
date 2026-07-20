import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { UserRole } from '../common/enums/user-role.enum';
import type { EventResponseDto } from '../events/dto/event-response.dto';
import type { EventRegistrationResponseDto } from './dto/event-registration-response.dto';
import { RegistrationsService } from './registrations.service';

@Controller()
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  @Get('me/events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ATTENDEE)
  findRegisteredEvents(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EventResponseDto[]> {
    return this.registrationsService.findRegisteredEvents(user.id);
  }

  @Post('events/:id/register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ATTENDEE)
  registerForEvent(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EventRegistrationResponseDto> {
    return this.registrationsService.registerForEvent(id, user.id);
  }

  @Delete('events/:id/register')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ATTENDEE)
  cancelRegistration(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.registrationsService.cancelRegistration(id, user.id);
  }
}

import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Roles } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { UserRole } from '../../common/enums/user-role.enum';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;

  beforeEach(() => {
    guard = new RolesGuard(new Reflector());
  });

  it('allows access when no roles are required', () => {
    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows access when the authenticated user has a required role', () => {
    class Controller {
      @Roles(UserRole.ORGANIZER)
      handler(this: void): void {}
    }

    expect(
      guard.canActivate(
        createContext(
          {
            id: 'user-id',
            role: UserRole.ORGANIZER,
          },
          Controller,
          Controller.prototype.handler,
        ),
      ),
    ).toBe(true);
  });

  it('rejects access when authentication is missing', () => {
    class Controller {
      @Roles(UserRole.ATTENDEE)
      handler(this: void): void {}
    }

    expect(() =>
      guard.canActivate(
        createContext(undefined, Controller, Controller.prototype.handler),
      ),
    ).toThrow('Authentication is required');
  });

  it('rejects access when the authenticated user lacks a required role', () => {
    class Controller {
      @Roles(UserRole.ORGANIZER)
      handler(this: void): void {}
    }

    expect(() =>
      guard.canActivate(
        createContext(
          {
            id: 'user-id',
            role: UserRole.ATTENDEE,
          },
          Controller,
          Controller.prototype.handler,
        ),
      ),
    ).toThrow('You do not have permission to access this resource');
  });
});

function createContext(
  user?: AuthenticatedUser,
  controllerClass?: object,
  handler?: () => void,
): ExecutionContext {
  class DefaultController {}

  const contextClass = controllerClass ?? DefaultController;
  const contextHandler = handler ?? (() => undefined);

  const context = {
    getArgByIndex: jest.fn(),
    getArgs: jest.fn(),
    getClass: jest.fn(() => contextClass),
    getHandler: jest.fn(() => contextHandler),
    getType: jest.fn(() => 'http'),
    switchToHttp: jest.fn(() => ({
      getNext: jest.fn(),
      getRequest: jest.fn(() => ({ user })),
      getResponse: jest.fn(),
    })),
    switchToRpc: jest.fn(),
    switchToWs: jest.fn(),
  };

  return context as unknown as ExecutionContext;
}

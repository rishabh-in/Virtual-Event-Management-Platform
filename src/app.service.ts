import { Injectable } from '@nestjs/common';

export interface HealthCheckResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

@Injectable()
export class AppService {
  getRootMessage(): string {
    return 'Virtual Event Management Platform API';
  }

  getHealth(): HealthCheckResponse {
    return {
      status: 'ok',
      service: 'virtual-event-management-platform',
      timestamp: new Date().toISOString(),
    };
  }
}

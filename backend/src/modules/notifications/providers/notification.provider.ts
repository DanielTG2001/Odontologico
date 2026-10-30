export interface SendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface NotificationProvider {
  send(to: string, message: string, meta?: Record<string, any>): Promise<SendResult>;
}

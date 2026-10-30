import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateOnlinePaymentDto {
  @IsString() @IsNotEmpty()
  invoiceId: string;

  /** Por defecto, el saldo pendiente de la factura */
  @IsOptional() @IsNumber() @Min(0.01)
  amount?: number;

  @IsOptional() @IsIn(['payphone', 'stripe', 'mock'])
  provider?: 'payphone' | 'stripe' | 'mock';

  /** Envía el enlace de pago al paciente */
  @IsOptional() @IsIn(['whatsapp', 'email', 'none'])
  sendVia?: 'whatsapp' | 'email' | 'none';
}

export class ConfirmOnlinePaymentDto {
  @IsString() @IsNotEmpty()
  provider: string;

  /** Parámetros de la redirección: Payphone {id, clientTransactionId}; Stripe {session_id, tx}; mock {tx, outcome} */
  @IsNotEmpty()
  params: Record<string, string>;
}

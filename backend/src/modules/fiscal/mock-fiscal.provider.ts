import { Injectable, Logger } from '@nestjs/common';
import { FiscalProvider, FiscalStampRequest, FiscalStampResult } from './fiscal.provider';

/**
 * Provider mock / desarrollo.
 * En producción reemplazar por implementación del PAC del país
 * (ej. México CFDI, Bolivia SIAT, etc.) vía FISCAL_PROVIDER=mock|custom
 */
@Injectable()
export class MockFiscalProvider implements FiscalProvider {
  private readonly logger = new Logger('MockFiscal');

  async stamp(req: FiscalStampRequest): Promise<FiscalStampResult> {
    const uuid = 'MOCK-' + Date.now() + '-' + req.invoiceId.slice(0, 8);
    this.logger.log(`Timbrado mock factura ${req.number} → ${uuid}`);
    return {
      success: true,
      uuid,
      provider: 'mock',
      raw: {
        message: 'Timbrado simulado. Configure FISCAL_PROVIDER e integración real del PAC nacional.',
        invoiceId: req.invoiceId,
        total: req.total,
      },
    };
  }

  async cancel(uuid: string, reason: string): Promise<FiscalStampResult> {
    return {
      success: true,
      uuid,
      provider: 'mock',
      raw: { cancelled: true, reason },
    };
  }
}

export interface FiscalStampRequest {
  invoiceId: string;
  number: string;
  total: number;
  subtotal: number;
  tax: number;
  patientDocument: string;
  patientName: string;
  items: { description: string; quantity: number; unitPrice: number }[];
}

export interface FiscalStampResult {
  success: boolean;
  uuid?: string;
  stampedXml?: string;
  pdfUrl?: string;
  raw?: any;
  error?: string;
  provider: string;
}

export interface FiscalProvider {
  stamp(req: FiscalStampRequest): Promise<FiscalStampResult>;
  cancel?(uuid: string, reason: string): Promise<FiscalStampResult>;
}

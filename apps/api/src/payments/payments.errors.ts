export class HoldNotPayableError extends Error {
  constructor(public readonly holdIds: string[]) {
    super(`Holds are not payable: ${holdIds.join(', ')}`);
  }
}

export class InvalidWebhookSignatureError extends Error {
  constructor() {
    super('Invalid webhook signature');
  }
}

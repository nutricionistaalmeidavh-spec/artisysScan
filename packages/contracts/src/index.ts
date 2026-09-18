export class ManifestValidationError extends Error {
  constructor(message = 'manifest contract not implemented') {
    super(message);
    this.name = 'ManifestValidationError';
  }
}

export function validateManifest(_value: unknown): never {
  throw new ManifestValidationError('manifest contract not implemented');
}

export async function loadManifest(_path: string): Promise<never> {
  throw new ManifestValidationError('manifest contract not implemented');
}

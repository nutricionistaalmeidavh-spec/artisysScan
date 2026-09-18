import { readFile } from 'node:fs/promises';

import Ajv, { type ErrorObject } from 'ajv/dist/ajv.js';
import { parse } from 'yaml';

import schema from '../schema/artisys-scan.schema.json' with { type: 'json' };
import type { ScanManifestV1 } from './types.js';

const ajv = new Ajv({ allErrors: true, strict: true });
const validateSchema = ajv.compile(schema);

function formatAjvError(error: ErrorObject): string {
  const location = error.instancePath || '/';
  const additionalProperty =
    error.keyword === 'additionalProperties' &&
    typeof error.params.additionalProperty === 'string'
      ? `: additional property '${error.params.additionalProperty}'`
      : '';

  return `${location} ${error.message ?? 'is invalid'}${additionalProperty}`;
}

export class ManifestValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[] | string) {
    const normalized = typeof issues === 'string' ? [issues] : [...issues];
    super(`Invalid ArtiSys Scan manifest: ${normalized.join('; ')}`);
    this.name = 'ManifestValidationError';
    this.issues = normalized;
  }
}

export function validateManifest(value: unknown): ScanManifestV1 {
  if (!validateSchema(value)) {
    throw new ManifestValidationError(
      (validateSchema.errors ?? []).map(formatAjvError),
    );
  }

  return value as ScanManifestV1;
}

export async function loadManifest(path: string): Promise<ScanManifestV1> {
  const contents = await readFile(path, 'utf8');

  let parsed: unknown;
  try {
    parsed = parse(contents);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ManifestValidationError(`YAML parse error: ${message}`);
  }

  return validateManifest(parsed);
}

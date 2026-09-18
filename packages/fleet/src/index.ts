import { readFile } from 'node:fs/promises';

import { parse } from 'yaml';

import { evaluateReleaseGate, type ReleaseGateDecision, type ReleaseGateResult } from '../../release-gate/src/index.js';
import type { UnifiedReportInput } from '../../reporter/src/index.js';

export type FleetProfile = 'quick' | 'full' | 'release';

export interface FleetProduct {
  id: string;
  root: string;
  profile: FleetProfile;
}

export interface FleetConfig {
  schema: 1;
  products: FleetProduct[];
}

export interface FleetProductResult {
  id: string;
  root: string;
  profile: FleetProfile;
  report: UnifiedReportInput;
  gate: ReleaseGateResult;
  error?: string;
}

export interface FleetReport {
  complete: boolean;
  decision: ReleaseGateDecision;
  summary: { pass: number; warn: number; block: number };
  products: FleetProductResult[];
}

export type FleetScanner = (product: FleetProduct) => Promise<UnifiedReportInput>;

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} must be a non-empty string.`);
}

export function validateFleetConfig(value: unknown): FleetConfig {
  if (!value || typeof value !== 'object') throw new Error('Fleet config must be an object.');
  const candidate = value as { schema?: unknown; products?: unknown };
  if (candidate.schema !== 1) throw new Error('Fleet config schema must be 1.');
  if (!Array.isArray(candidate.products) || candidate.products.length === 0) throw new Error('Fleet config requires at least one product.');

  const seen = new Set<string>();
  const products = candidate.products.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new Error(`products[${index}] must be an object.`);
    const item = raw as { id?: unknown; root?: unknown; profile?: unknown };
    assertString(item.id, `products[${index}].id`);
    assertString(item.root, `products[${index}].root`);
    if (!['quick', 'full', 'release'].includes(String(item.profile))) {
      throw new Error(`products[${index}].profile must be quick, full or release.`);
    }
    if (seen.has(item.id)) throw new Error(`Duplicate fleet product id: ${item.id}`);
    seen.add(item.id);
    return { id: item.id, root: item.root, profile: item.profile as FleetProfile };
  });

  return { schema: 1, products };
}

export async function loadFleetConfig(path: string): Promise<FleetConfig> {
  const text = await readFile(path, 'utf8');
  return validateFleetConfig(parse(text));
}

function fallbackReport(product: FleetProduct, error: unknown): UnifiedReportInput {
  return {
    productId: product.id,
    profile: product.profile,
    passed: false,
    complete: false,
    findings: [],
    checks: [{ id: 'fleet.scan', name: 'Fleet product scan', status: 'incomplete' }],
    evidence: [],
  };
}

function worstDecision(products: FleetProductResult[]): ReleaseGateDecision {
  if (products.some((item) => item.gate.decision === 'BLOCK')) return 'BLOCK';
  if (products.some((item) => item.gate.decision === 'WARN')) return 'WARN';
  return 'PASS';
}

export async function runFleet(
  config: FleetConfig,
  scanProduct: FleetScanner,
  options: { concurrency?: number } = {},
): Promise<FleetReport> {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, config.products.length));
  const results: Array<FleetProductResult | undefined> = new Array(config.products.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      const product = config.products[index];
      if (!product) return;
      try {
        const report = await scanProduct(product);
        results[index] = {
          id: product.id,
          root: product.root,
          profile: product.profile,
          report,
          gate: evaluateReleaseGate(report),
        };
      } catch (error) {
        const report = fallbackReport(product, error);
        results[index] = {
          id: product.id,
          root: product.root,
          profile: product.profile,
          report,
          gate: evaluateReleaseGate(report),
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const products = results.filter((item): item is FleetProductResult => item !== undefined);
  const summary = {
    pass: products.filter((item) => item.gate.decision === 'PASS').length,
    warn: products.filter((item) => item.gate.decision === 'WARN').length,
    block: products.filter((item) => item.gate.decision === 'BLOCK').length,
  };

  return {
    complete: products.length === config.products.length && products.every((item) => item.report.complete),
    decision: worstDecision(products),
    summary,
    products,
  };
}

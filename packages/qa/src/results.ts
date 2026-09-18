import { basename, extname, sep } from 'node:path';

import type { PlaywrightSummary, QaArtifacts } from './types.js';

export function summarizePlaywrightJson(raw: string): PlaywrightSummary {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Playwright returned invalid JSON: ${detail}`);
  }

  const summary: PlaywrightSummary = { total: 0, passed: 0, failed: 0, skipped: 0, other: 0 };

  const visitSuite = (suite: any): void => {
    for (const spec of Array.isArray(suite?.specs) ? suite.specs : []) {
      for (const test of Array.isArray(spec?.tests) ? spec.tests : []) {
        const results = Array.isArray(test?.results) ? test.results : [];
        const finalResult = results.length > 0 ? results[results.length - 1] : undefined;
        const status = String(finalResult?.status ?? test?.status ?? 'unknown').toLowerCase();
        summary.total += 1;
        if (status === 'passed') summary.passed += 1;
        else if (status === 'failed' || status === 'timedout' || status === 'timed-out' || status === 'interrupted') summary.failed += 1;
        else if (status === 'skipped') summary.skipped += 1;
        else summary.other += 1;
      }
    }
    for (const child of Array.isArray(suite?.suites) ? suite.suites : []) visitSuite(child);
  };

  for (const suite of Array.isArray(data?.suites) ? data.suites : []) visitSuite(suite);
  return summary;
}

export function classifyQaArtifacts(paths: string[]): QaArtifacts {
  const artifacts: QaArtifacts = {
    screenshots: [],
    videos: [],
    traces: [],
    jsonReports: [],
    htmlReports: [],
    other: [],
  };

  for (const path of paths) {
    const normalized = path.split(sep).join('/').toLowerCase();
    const name = basename(path).toLowerCase();
    const extension = extname(name);

    if (['.png', '.jpg', '.jpeg'].includes(extension)) artifacts.screenshots.push(path);
    else if (['.webm', '.mp4'].includes(extension)) artifacts.videos.push(path);
    else if (name === 'trace.zip' || (extension === '.zip' && normalized.includes('trace'))) artifacts.traces.push(path);
    else if (extension === '.json') artifacts.jsonReports.push(path);
    else if (extension === '.html') artifacts.htmlReports.push(path);
    else artifacts.other.push(path);
  }

  return artifacts;
}

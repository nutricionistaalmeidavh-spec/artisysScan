import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeElectronText, analyzeDesktopArtifacts } from '../src/index.ts';

test('flags dangerous Electron webPreferences and preload exposure', () => {
  const source = `
    new BrowserWindow({ webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      webviewTag: true,
      devTools: true
    }});
    contextBridge.exposeInMainWorld('electron', ipcRenderer);
    mainWindow.loadURL('http://example.com');
  `;
  const ids = analyzeElectronText('electron/main.ts', source).map((finding) => finding.ruleId);
  assert.ok(ids.includes('ARTISYS-ELECTRON-001'));
  assert.ok(ids.includes('ARTISYS-ELECTRON-002'));
  assert.ok(ids.includes('ARTISYS-ELECTRON-003'));
  assert.ok(ids.includes('ARTISYS-ELECTRON-004'));
  assert.ok(ids.includes('ARTISYS-ELECTRON-005'));
  assert.ok(ids.includes('ARTISYS-ELECTRON-007'));
});

test('does not flag hardened Electron preferences as critical', () => {
  const source = `new BrowserWindow({ webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false } });`;
  const findings = analyzeElectronText('electron/main.ts', source);
  assert.equal(findings.some((finding) => finding.severity === 'critical'), false);
});

test('flags tracked SQLite databases and obvious token persistence artifacts', () => {
  const findings = analyzeDesktopArtifacts([
    'data/customer.sqlite',
    'logs/access-token.log',
    'dist/app.exe',
  ]);
  const ids = findings.map((finding) => finding.ruleId);
  assert.ok(ids.includes('ARTISYS-DESKTOP-DATA-001'));
  assert.ok(ids.includes('ARTISYS-DESKTOP-TOKEN-001'));
});

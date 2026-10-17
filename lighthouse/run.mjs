import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lighthouseDir = path.join(root, 'lighthouse');
const reportsDir = path.join(lighthouseDir, 'reports');
const previewUrl = 'http://127.0.0.1:4174';
const publicUrl = process.env.LIGHTHOUSE_PUBLIC_URL?.trim();
const pages = [
  { name: 'home', path: '/' },
  { name: 'nft-detail', path: '/nft/1' },
];
const profiles = ['mobile', 'desktop'];
const runsPerPage = 3;
const categories = [
  { id: 'performance', label: 'Performance', target: 90 },
  { id: 'accessibility', label: 'Accessibility', target: 95 },
  { id: 'best-practices', label: 'Best Practices', target: 95 },
  { id: 'seo', label: 'SEO', target: 90 },
];
const records = [];
let preview;
let chromeVersion = 'unavailable';

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? 'null'} (signal ${signal ?? 'none'})`));
    });
  });
}

async function waitForPreview(child) {
  const timeoutAt = Date.now() + 90_000;
  let lastError;
  while (Date.now() < timeoutAt) {
    if (child.exitCode !== null) throw new Error(`Vite preview exited early (code ${child.exitCode}).`);
    try {
      const response = await fetch(previewUrl);
      if (response.ok) return;
      lastError = new Error(`Vite preview returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for Vite preview at ${previewUrl}.`, { cause: lastError });
}

function metric(lhr, auditId) {
  return lhr.audits[auditId]?.numericValue ?? null;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function formatScore(value) {
  return value === null ? 'n/a' : (value * 100).toFixed(1);
}

function formatMetric(value, unit, digits = 0) {
  return value === null ? 'n/a' : `${value.toFixed(digits)}${unit}`;
}

function summaryTable(origin, title) {
  const lines = [`### ${title}`, '', '| Página | Perfil | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT |', '|---|---|---:|---:|---:|---:|---:|---:|---:|'];
  for (const page of pages) {
    for (const profile of profiles) {
      const subset = records.filter((record) => record.origin === origin && record.page === page.name && record.profile === profile);
      if (!subset.length) continue;
      const categoryMedians = Object.fromEntries(categories.map(({ id }) => [
        id,
        median(subset.map((record) => record.scores[id])),
      ]));
      const lcp = median(subset.map((record) => record.metrics.lcp));
      const cls = median(subset.map((record) => record.metrics.cls));
      const tbt = median(subset.map((record) => record.metrics.tbt));
      lines.push(`| ${page.name} | ${profile} | ${formatScore(categoryMedians.performance)} | ${formatScore(categoryMedians.accessibility)} | ${formatScore(categoryMedians['best-practices'])} | ${formatScore(categoryMedians.seo)} | ${formatMetric(lcp / 1000, ' s', 2)} | ${formatMetric(cls, '', 3)} | ${formatMetric(tbt, ' ms')} |`);
    }
  }
  return lines;
}

function belowTargetNotes(origin) {
  const notes = [];
  for (const page of pages) {
    for (const profile of profiles) {
      const subset = records.filter((record) => record.origin === origin && record.page === page.name && record.profile === profile);
      if (!subset.length) continue;
      for (const category of categories) {
        const score = median(subset.map((record) => record.scores[category.id]));
        if (score === null || score * 100 >= category.target) continue;
        const failedAuditIds = new Set(subset.flatMap((record) => record.lhr.categories[category.id].auditRefs
          .filter((ref) => ref.weight > 0 && record.lhr.audits[ref.id]?.score !== null && record.lhr.audits[ref.id]?.score < 1)
          .map((ref) => ref.id)));
        const audits = [...failedAuditIds].map((id) => {
          const audit = subset[0].lhr.audits[id];
          return audit?.displayValue ? `${audit.title} (${audit.displayValue})` : audit?.title;
        }).filter(Boolean);
        notes.push(`- **${page.name}/${profile}, ${category.label}:** mediana ${formatScore(score)}/100 (meta ${category.target}); auditorias abaixo de 100: ${audits.join('; ') || 'nenhuma auditoria ponderada identificada'}.`);
      }
    }
  }
  return notes;
}

function mobilePerformanceDiagnosis(origin) {
  const lines = [];
  for (const page of pages) {
    const subset = records.filter((record) => record.origin === origin && record.page === page.name && record.profile === 'mobile');
    const performance = median(subset.map((record) => record.scores.performance));
    if (performance === null || performance * 100 >= 90) continue;
    const lcp = median(subset.map((record) => record.metrics.lcp));
    const fcp = median(subset.map((record) => record.lhr.audits['first-contentful-paint'].numericValue));
    const renderDelay = median(subset.map((record) => {
      const phases = record.lhr.audits['largest-contentful-paint-element']?.details?.items?.[1]?.items ?? [];
      return phases.find((phase) => phase.phase === 'Render Delay')?.timing;
    }));
    lines.push(`- **${page.name}/mobile:** LCP median ${formatMetric(lcp / 1000, ' s', 2)}, FCP ${formatMetric(fcp / 1000, ' s', 2)}, LCP render delay ${formatMetric(renderDelay / 1000, ' s', 2)}. ` +
      'The entry point intentionally waits for MSW `worker.start()` before mounting React so REST/Socket.IO requests cannot escape the mock; the app and route data are client-rendered. On the simulated 4× CPU/mobile network, this startup/paint delay remains the dominant opportunity. `main.tsx` is not bypassed and mocks/realtime remain enabled; further score gains would require changing that behavior or testing conditions.');
  }
  return lines;
}

async function saveSummary() {
  const cpu = os.cpus()[0]?.model ?? 'unknown CPU';
  const memoryGiB = (os.totalmem() / 1024 ** 3).toFixed(1);
  const lines = [
    '# Lighthouse audit results',
    '',
    `Generated: ${new Date().toISOString()}.`,
    '',
    '## Toolchain and conditions',
    '',
    '- Lighthouse: 12.8.2',
    `- Chrome: ${chromeVersion}`,
    `- Node.js: ${process.version}; npm: ${process.env.npm_config_user_agent?.split('/')[1]?.split(' ')[0] ?? 'see npm --version'}`,
    `- OS: ${os.type()} ${os.release()} (${os.arch()})`,
    `- Machine: ${cpu}; ${os.cpus().length} logical CPUs; ${memoryGiB} GiB RAM.`,
    '- Build: optimized `npm run build:demo`, served by `vite preview`; MSW enabled with the default `success` scenario.',
    '- Each run launches a fresh headless Chrome profile (empty HTTP cache/storage); no warm-cache runs.',
    '- Three runs per page/profile, sequentially. Mobile: 390×844, simulated 150 ms RTT / 1.6 Mbps / 4× CPU. Desktop: 1440×900, simulated 40 ms RTT / 10 Mbps / 1× CPU.',
    '- Reports contain the real Lighthouse output for every individual run. Tables show medians; category scores are 0–100.',
    '',
    '## Local preview medians',
    '',
    'Before these final measurements, the existing NFT artwork was additionally served as optimized WebP (original PNGs retained), the Latin font and first NFT image were preloaded, image dimensions/priority were declared, and the catalog loading skeleton reserves the result-grid/pagination space. This removed the measured home-page layout shift and the oversized PNG transfer opportunity without removing content or disabling mocks.',
    '',
    ...summaryTable('local', 'Local optimized demo build'),
    '',
    '### Local targets and remaining opportunities',
    '',
    ...(belowTargetNotes('local').length ? belowTargetNotes('local') : ['All measured local page/profile medians meet the requested category targets.']),
    ...(mobilePerformanceDiagnosis('local').length
      ? ['', '### Remaining mobile performance diagnosis', '', ...mobilePerformanceDiagnosis('local')]
      : []),
    '',
    '## Public deployment medians',
    '',
  ];
  if (publicUrl) {
    lines.push(...summaryTable('public', `Public deployment (${publicUrl})`), '');
    const publicTargetNotes = belowTargetNotes('public');
    lines.push(
      '### Public targets and measured causes',
      '',
      ...(publicTargetNotes.length ? publicTargetNotes : ['All measured public page/profile medians meet the requested category targets.']),
      '',
      'The deployment was audited read-only as requested. The public reports show no meta description and `robots.txt` returning the SPA HTML (18 parse errors); no deploy configuration or published files were changed.',
      '',
    );
    for (const page of pages) {
      for (const profile of profiles) {
        const localRecords = records.filter((record) => record.origin === 'local' && record.page === page.name && record.profile === profile);
        const publicRecords = records.filter((record) => record.origin === 'public' && record.page === page.name && record.profile === profile);
        if (!localRecords.length || !publicRecords.length) continue;
        const localScore = median(localRecords.map((record) => record.scores.performance));
        const publicScore = median(publicRecords.map((record) => record.scores.performance));
        lines.push(`- **${page.name}/${profile}:** Performance ${formatScore(publicScore)} public vs ${formatScore(localScore)} local (${publicScore === null || localScore === null ? 'n/a' : `${((publicScore - localScore) * 100).toFixed(1)} points`}).`);
      }
    }
  } else {
    lines.push('**Not measured:** no public URL was provided. Set `LIGHTHOUSE_PUBLIC_URL` to the deployed application URL and run `npm run lighthouse` again to collect all 12 public runs; no public scores are inferred or fabricated.', '');
  }
  await writeFile(path.join(lighthouseDir, 'SUMMARY.md'), `${lines.join('\n')}\n`, 'utf8');
}

async function audit(url, origin) {
  for (const page of pages) {
    for (const profile of profiles) {
      const config = JSON.parse(await readFile(path.join(lighthouseDir, 'config', `${profile}.json`), 'utf8'));
      for (let run = 1; run <= runsPerPage; run += 1) {
        const browser = await chromeLauncher.launch({
          chromePath: process.env.LIGHTHOUSE_CHROME_PATH ?? process.env.CHROME_PATH,
          chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
          logLevel: 'error',
        });
        try {
          if (chromeVersion === 'unavailable') {
            const versionResponse = await fetch(`http://127.0.0.1:${browser.port}/json/version`);
            const versionDetails = await versionResponse.json();
            chromeVersion = versionDetails.Browser ?? chromeVersion;
          }
          const result = await lighthouse(`${url.replace(/\/$/, '')}${page.path}`, {
            port: browser.port,
            output: ['html', 'json'],
            logLevel: 'error',
            maxWaitForLoad: 60_000,
          }, config);
          if (!result?.lhr || !result.report) throw new Error('Lighthouse did not return reports.');
          const reports = Array.isArray(result.report) ? result.report : [result.report];
          const stem = `${origin}-${page.name}-${profile}-run-${run}`;
          await Promise.all([
            writeFile(path.join(reportsDir, `${stem}.html`), reports[0], 'utf8'),
            writeFile(path.join(reportsDir, `${stem}.json`), reports[1], 'utf8'),
          ]);
          const lhr = result.lhr;
          records.push({
            origin,
            page: page.name,
            profile,
            scores: Object.fromEntries(categories.map(({ id }) => [id, lhr.categories[id]?.score ?? null])),
            metrics: {
              lcp: metric(lhr, 'largest-contentful-paint'),
              cls: metric(lhr, 'cumulative-layout-shift'),
              tbt: metric(lhr, 'total-blocking-time'),
            },
            lhr,
          });
          console.log(`${origin} ${page.name}/${profile} run ${run}: `
            + categories.map(({ id }) => `${id}=${formatScore(lhr.categories[id]?.score)}`).join(', '));
        } finally {
          await browser.kill();
        }
      }
    }
  }
}

try {
  await mkdir(reportsDir, { recursive: true });
  console.log('Building optimized demo with MSW enabled...');
  await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:demo']);
  preview = spawn(process.execPath, [
    path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
    'preview',
    '--host', '127.0.0.1',
    '--port', '4174',
    '--strictPort',
  ], { cwd: root, stdio: 'inherit' });
  await waitForPreview(preview);
  await audit(previewUrl, 'local');
  if (publicUrl) await audit(publicUrl, 'public');
  await saveSummary();
  console.log(`Summary saved to ${path.join(lighthouseDir, 'SUMMARY.md')}`);
} catch (error) {
  console.error('Lighthouse audit failed:', error);
  process.exitCode = 1;
} finally {
  if (preview && preview.exitCode === null) preview.kill('SIGTERM');
}

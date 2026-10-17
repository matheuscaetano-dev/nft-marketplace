# Lighthouse audit results

Generated: 2026-10-17T16:27:05.084Z.

## Toolchain and conditions

- Lighthouse: 12.8.2
- Chrome: Chrome/155.0.8059.84
- Node.js: v20.20.0; npm: 11.21.1
- OS: Windows_NT 10.0.26200 (x64)
- Machine: 11th Gen Intel(R) Core(TM) i5-1135G7 @ 2.40GHz; 8 logical CPUs; 7.7 GiB RAM.
- Build: optimized `npm run build:demo`, served by `vite preview`; MSW enabled with the default `success` scenario.
- Each run launches a fresh headless Chrome profile (empty HTTP cache/storage); no warm-cache runs.
- Three runs per page/profile, sequentially. Mobile: 390×844, simulated 150 ms RTT / 1.6 Mbps / 4× CPU. Desktop: 1440×900, simulated 40 ms RTT / 10 Mbps / 1× CPU.
- Reports contain the real Lighthouse output for every individual run. Tables show medians; category scores are 0–100.

## Local preview medians

Before these final measurements, the existing NFT artwork was additionally served as optimized WebP (original PNGs retained), the Latin font and first NFT image were preloaded, image dimensions/priority were declared, and the catalog loading skeleton reserves the result-grid/pagination space. This removed the measured home-page layout shift and the oversized PNG transfer opportunity without removing content or disabling mocks.

### Local optimized demo build

| Página | Perfil | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| home | mobile | 82.0 | 98.0 | 100.0 | 92.0 | 4.11 s | 0.000 | 140 ms |
| home | desktop | 99.0 | 98.0 | 100.0 | 92.0 | 0.87 s | 0.000 | 0 ms |
| nft-detail | mobile | 84.0 | 100.0 | 96.0 | 92.0 | 3.84 s | 0.000 | 110 ms |
| nft-detail | desktop | 99.0 | 100.0 | 100.0 | 92.0 | 0.84 s | 0.000 | 0 ms |

### Local targets and remaining opportunities

- **home/mobile, Performance:** mediana 82.0/100 (meta 90); auditorias abaixo de 100: First Contentful Paint (2.7 s); Largest Contentful Paint (4.2 s); Total Blocking Time (260 ms); Speed Index (2.7 s).
- **nft-detail/mobile, Performance:** mediana 84.0/100 (meta 90); auditorias abaixo de 100: First Contentful Paint (2.6 s); Largest Contentful Paint (4.0 s); Total Blocking Time (110 ms); Speed Index (2.6 s).

### Remaining mobile performance diagnosis

- **home/mobile:** LCP median 4.11 s, FCP 2.55 s, LCP render delay 0.88 s. The entry point intentionally waits for MSW `worker.start()` before mounting React so REST/Socket.IO requests cannot escape the mock; the app and route data are client-rendered. On the simulated 4× CPU/mobile network, this startup/paint delay remains the dominant opportunity. `main.tsx` is not bypassed and mocks/realtime remain enabled; further score gains would require changing that behavior or testing conditions.
- **nft-detail/mobile:** LCP median 3.84 s, FCP 2.58 s, LCP render delay 3.35 s. The entry point intentionally waits for MSW `worker.start()` before mounting React so REST/Socket.IO requests cannot escape the mock; the app and route data are client-rendered. On the simulated 4× CPU/mobile network, this startup/paint delay remains the dominant opportunity. `main.tsx` is not bypassed and mocks/realtime remain enabled; further score gains would require changing that behavior or testing conditions.

## Public deployment medians

### Public deployment (https://nft-marketplace-eight-mu.vercel.app/)

| Página | Perfil | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| home | mobile | 79.0 | 98.0 | 100.0 | 83.0 | 2.58 s | 0.306 | 121 ms |
| home | desktop | 100.0 | 98.0 | 100.0 | 83.0 | 0.59 s | 0.000 | 0 ms |
| nft-detail | mobile | 95.0 | 100.0 | 96.0 | 83.0 | 2.57 s | 0.000 | 80 ms |
| nft-detail | desktop | 100.0 | 100.0 | 100.0 | 83.0 | 0.57 s | 0.000 | 0 ms |

### Public targets and measured causes

- **home/mobile, Performance:** mediana 79.0/100 (meta 90); First Contentful Paint 2.0 s, Largest Contentful Paint 2.6 s, Total Blocking Time 120 ms, Cumulative Layout Shift 0.306 and Speed Index 2.0 s. The LCP is a catalog NFT PNG; Lighthouse attributes most of its delay to resource load delay and load time. The reported layout shift also materially lowers this result.
- **all public page/profile combinations, SEO:** mediana 83.0/100 (meta 90); Lighthouse reports a missing meta description and `robots.txt` returning the SPA HTML, with 18 parse errors.
- The public report serves an English-language document and an older PNG asset, unlike the current local demo build. This indicates the published artifact differs from the locally audited source. The deployment was audited read-only as requested; no deploy configuration or published files were changed.

- **home/mobile:** Performance 79.0 public vs 82.0 local (-3.0 points).
- **home/desktop:** Performance 100.0 public vs 99.0 local (1.0 points).
- **nft-detail/mobile:** Performance 95.0 public vs 84.0 local (11.0 points).
- **nft-detail/desktop:** Performance 100.0 public vs 99.0 local (1.0 points).

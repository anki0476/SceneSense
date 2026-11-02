"""Render local evidence only. Never uploads footage or starts OBS/capture."""
import html, json, pathlib
from datetime import datetime, timezone
import cv2
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = ROOT / '.artifacts' / 'matting-evaluation-20261101'
OUT = BASE / 'native'
BEST = 'directml-fp32-0.375-reference'
FAST = 'directml-fp32-0.25-reference'

def composite(path, white=False):
    im = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if im is None: raise FileNotFoundError(path)
    if im.shape[2] == 3: return im
    a = im[:, :, 3:4].astype(np.float32) / 255
    return np.rint(im[:, :, :3] * a + (255 if white else 0) * (1-a)).astype(np.uint8)

def panel(im, title):
    im = cv2.resize(im, (480, 270))
    band = np.full((38,480,3), 27, np.uint8)
    cv2.putText(band, title, (12,25), cv2.FONT_HERSHEY_SIMPLEX, .55, (240,240,240), 1, cv2.LINE_AA)
    return np.vstack((band,im))

results = [json.loads(p.read_text()) for p in sorted(OUT.glob('*-reference-results.json'))]
best = next(r for r in results if r['tag'] == BEST)
for tag in (BEST, FAST):
    for t in (4000,8000,12000,16000,20000):
        src = OUT / f'{tag}-{t}.png'
        for white in (False,True):
            cv2.imwrite(str(OUT / f'{tag}-{t}-{"white" if white else "black"}.png'), composite(src,white))

rows = []
for t in (4000,8000,12000):
    images = [(BASE/f'raw-{t}.png',f'Original - {t//1000}s'),
              (BASE/f'baseline-{t}.png','Original hard-mask filter'),
              (OUT/f'{BEST}-{t}.png','Native soft matte / black')]
    cells = [panel(composite(p), title) for p,title in images]
    rows.append(np.hstack(cells))
cv2.imwrite(str(OUT/'native-comparison.jpg'),np.vstack(rows))
cells=[]
for t in (4000,16000):
    cells.append(np.hstack([panel(composite(OUT/f'{tag}-{t}.png'),f'Ratio {ratio} - {t//1000}s') for tag,ratio in ((BEST,'.375'),(FAST,'.25'))]))
cv2.imwrite(str(OUT/'native-resolution-comparison.jpg'),np.vstack(cells))

table = ''.join(f'<tr><td>{html.escape(r["tag"])}</td><td>{r["motion"]["frames"]}</td><td>{r["motion"]["processingIncludingDecode"]["medianMs"]:.1f} ms</td><td>{r["motion"]["processingIncludingDecode"]["p95Ms"]:.1f} ms</td><td>{r["motion"]["processingFps"]:.1f}</td></tr>' for r in results)
samples = ''.join(f'<figure><img src="{BEST}-{t}-black.png"><figcaption>{t//1000}s — black</figcaption></figure><figure><img src="{BEST}-{t}-white.png"><figcaption>{t//1000}s — white</figcaption></figure>' for t in (4000,8000,12000,16000,20000))
page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SceneSense — native matting evidence</title>
<style>body{{font:16px/1.55 system-ui;background:#101116;color:#ececf1;max-width:1150px;margin:40px auto;padding:0 24px}}h1,h2{{line-height:1.2}}p,li{{color:#c4c5d0}}a{{color:#b7a0ff}}table{{border-collapse:collapse;width:100%;font-size:14px}}td,th{{padding:10px;border-bottom:1px solid #373844;text-align:left}}.scroll{{overflow:auto}}img{{max-width:100%;height:auto}}.grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}}figure{{margin:0}}video{{width:100%;max-width:640px}}.result{{border:1px solid #6e59a1;padding:18px;border-radius:14px}}@media(max-width:640px){{.grid{{grid-template-columns:1fr}}}}</style>
<h1>Native GPU matting: meaningful progress, still experimental</h1>
<p class="result">Best tested path: official RVM MobileNetV3 FP32, DirectML on the GTX 1650, internal ratio .375, 640 × 360 output. All 601 saved frames processed. Median <b>29.0 ms</b>, p95 <b>40.6 ms</b>, isolated throughput <b>32.8 FPS</b>. The strict 33.3 ms p95 target remains unmet.</p>
<p>No production defaults changed. No API calls, uploads, or new webcam recordings. This is a native engine feasibility experiment, not an OBS-integrated feature.</p>
<h2>Visual comparison</h2><p>Same saved clip. Original filter screenshots passed through OBS; exact frame alignment may differ. Native output has soft transparency, better rounded boundaries and preserved hand-over-face movement. Fine hair, pale fringes and the lower shirt edge still need scrutiny. No ground-truth matte or quality percentage is available.</p>
<a href="native-comparison.jpg"><img src="native-comparison.jpg" alt="Original frames, initial hard mask and native soft matte at 4, 8 and 12 seconds"></a>
<h2>Offline motion render</h2><video controls preload="metadata" src="{BEST}-black.web.mp4"></video><p>This video replays offline output at the source's 30 FPS. Playback is not a measurement of live camera-to-OBS latency. Timings below exclude review-video compositing/encoding, and include decoding, normalization, inference, transfers, and RGBA preparation.</p>
<h2>Measured processing</h2><div class="scroll"><table><thead><tr><th>Run</th><th>Frames</th><th>Median</th><th>p95</th><th>Processed FPS</th></tr></thead><tbody>{table}</tbody></table></div>
<p>CPU .5 is a control; the .5 FP32 run is only 120 frames, so neither substitutes for the full motion tests. Earlier NVIDIA WebGL processing: median 113.4 ms, p95 141 ms, about 8.1 processed FPS. Different runtimes/model representations mean this is a practical path comparison, not a controlled runtime-only speedup claim.</p>
<h2>Resolution tradeoff</h2><p>The lighter .25 setting did not improve throughput in this run. Keep .375 as the experiment's selected setting; no claim of statistical significance from one run per configuration.</p><img src="native-resolution-comparison.jpg" alt="Native ratios .375 and .25 at the same saved frames">
<h2>Check the edges on both backgrounds</h2><div class="grid">{samples}</div>
<h2>What the evidence supports</h2><ul><li>Actual DirectML node execution verified on the NVIDIA adapter. Some CPU shape operations remain.</li><li>CPU/GPU FP32 control mattes on the same static input differed by at most one alpha level out of 255. This verifies agreement, not segmentation accuracy.</li><li>The stable path copies recurrent tensors through CPU memory. Attempts at GPU-resident recurrent I/O failed and are excluded from the executable.</li><li>FP16 was slower in this tested path; its preprocessing differed from the later optimized FP32 runs.</li><li>Live transparent delivery to OBS, added latency, GPU contention with Asphalt, sustained thermal behavior, difficult lighting, hair detail, and leaving/re-entering the frame remain unvalidated.</li></ul>
<p><b>Decision:</b> retain the native experiment because it makes clear processing progress; do not promote it to the app until a live OBS + Asphalt acceptance test passes. No claim of green-screen equivalence.</p>
<p><a href="{BEST}-results.json">Selected run data</a> · <a href="../review.html">Earlier filter and WebGL experiments</a> · <a href="https://github.com/PeterL1n/RobustVideoMatting">Official RVM project</a></p></html>'''
(OUT/'review.html').write_text(page,encoding='utf8')

ledger_path = ROOT/'design'/'background-removal-evidence.json'
ledger = json.loads(ledger_path.read_text(encoding='utf8'))
trial_end = datetime.fromtimestamp((OUT/f'{FAST}-results.json').stat().st_mtime,timezone.utc)
native = ledger['nativeFinal']
native.update(status='completed', inferenceCompletedAt=trial_end.isoformat(), selected=best, runs=results,
    scope='Official RVM FP16/FP32 native DirectML on verified NVIDIA adapter; saved clip only. Stable CPU roundtrip recurrent state, failed GPU-resident I/O excluded.',
    meaningfulProgress=True, strictP95TargetMet=False, productionIntegrated=False,
    cpuGpuStaticAlphaAgreement={'meanAbsoluteDifferenceOutOf255':0.000004340277777777778,'maxDifferenceOutOf255':1,'meaning':'Numerical agreement only; not ground-truth quality.'},
    failedApproach='GPU-resident recurrent I/O binding caused a device error/access violation. Excluded; session.run reference path is stable.',
    review='.artifacts/matting-evaluation-20261101/native/review.html')
native['elapsedInferenceExperimentMinutes']=(trial_end-datetime.fromisoformat(native['startedAt'].replace('Z','+00:00'))).total_seconds()/60
ledger['decision']='Retain native matting experiment: meaningful progress (32.8 processed FPS, 29.0 ms median), but no production promotion. p95 40.6 ms and OBS/gameplay integration remain gates.'
text=json.dumps(ledger,indent=2).replace('577/674','577/677')
ledger_path.write_text(text+'\n',encoding='utf8')
print(json.dumps({'report':str(OUT/'review.html'),'comparison':str(OUT/'native-comparison.jpg'),'experimentMinutes':native['elapsedInferenceExperimentMinutes']}))

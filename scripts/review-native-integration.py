"""Summarize local integration receipts without capture, inference, or network."""
import html, json, pathlib
from datetime import datetime, timezone

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'.artifacts/native-integration-20261101'
runs=[]
for directory in sorted(OUT.iterdir()):
    if directory.is_dir() and (directory/'results.json').exists():
        result=json.loads((directory/'results.json').read_text())
        result['directory']=directory.name
        result['restoration']=json.loads((directory/'restoration.json').read_text()) if (directory/'restoration.json').exists() else None
        result['independentRestorationAudit']=json.loads((directory/'restoration-audit.json').read_text()) if (directory/'restoration-audit.json').exists() else None
        runs.append(result)
live=next(r for r in reversed(runs) if r['mode']=='webcam')
replay=next(r for r in runs if r['directory']=='replay-1793512652789')
alpha=json.loads((OUT/live['directory']/'alpha-verification.json').read_text())
lifecycle=json.loads((OUT/'lifecycle.json').read_text())
labels=['Raw RGBA / CPU canvas','Full RGBA PNG / CPU canvas','Raw RGBA / instrumented','JPEG + RGBA alpha / CPU canvas','JPEG + grayscale alpha / GPU canvas','Array-copy trial (reverted)','Physical webcam / GPU canvas']
rows=''.join(f'<tr><td>{html.escape(label)}</td><td>{r["deliveredFps"]:.1f}</td><td>{r["captureToCanvasMs"]["median"]} / {r["captureToCanvasMs"]["p95"]} ms</td><td>{r["obs"]["fps"]:.0f} / {r["obs"]["skipped"]}</td><td><a href="{r["directory"]}/results.json">Data</a></td></tr>' for label,r in zip(labels,runs))
page=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SceneSense — native OBS integration</title>
<style>body{{font:16px/1.55 system-ui;max-width:1100px;margin:40px auto;padding:0 24px;background:#101116;color:#eeeef5}}p,li{{color:#c5c6d1}}a{{color:#bc9dff}}img{{max-width:100%;height:auto}}.result{{padding:20px;border:1px solid #745ca7;border-radius:16px}}table{{border-collapse:collapse;width:100%;font-size:14px}}td,th{{padding:12px 10px;text-align:left;border-bottom:1px solid #393a45}}.table{{overflow:auto}}</style>
<h1>Native camera → GPU → OBS: working experimental path</h1>
<p class="result">Physical webcam probe: <b>{live['deliveredFps']:.1f} cutout updates/second</b>, <b>{live['captureToCanvasMs']['median']} ms median</b> and <b>{live['captureToCanvasMs']['p95']} ms p95</b> capture-request-to-canvas acknowledgement. OBS remained at <b>30 FPS with zero skipped render frames</b> during the 20-second sample.</p>
<p>These are lower-bound transport timings: they do not include physical exposure timing or prove when OBS presented each canvas update. No Asphalt race, voice/watching concurrency, or long thermal test was performed. The normal app background-removal toggle still uses the original plugin.</p>
<h2>Actual OBS composition from the saved-clip replay</h2><img src="{replay['directory']}/program.png" alt="Native cutout over a checkerboard inside actual OBS output"><p>This screenshot is from a real-time replay of the saved clip through OBS, the native worker and the OBS Browser Source. It is not the physical-webcam motion-quality sample. The checkerboard is a separate OBS image source showing through the cutout.</p>
<h2>What is verified</h2><ul><li>Physical OBS Webcam source captured locally, processed by FP32 RVM on the GTX 1650 using DirectML, and returned to OBS with soft transparency.</li><li>Matched final-frame alpha survived the transport exactly: maximum difference <b>{alpha['alphaMaxDifferenceOutOf255']}/255</b>. This verifies transport only, not segmentation accuracy.</li><li>Local server binds only to loopback, uses an unguessable session path and rejects foreign WebSocket origins.</li><li>Queues retain only the most recent pending frame, rather than accumulating video delay.</li><li>Independent readback confirmed the original scene, virtual-camera state, webcam filters and webcam transform were restored. Temporary QA sources were removed. No stream or recording was started.</li></ul>
<h2>Performance experiments</h2><div class="table"><table><thead><tr><th>Probe</th><th>Delivered FPS</th><th>Median / p95 delay</th><th>OBS FPS / skipped</th><th>Receipt</th></tr></thead><tbody>{rows}</tbody></table></div><p>Each probe is short and affected by current machine load. These are diagnostic observations, not statistically established speedups. The colour payload uses JPEG quality 97; the alpha mask remains lossless.</p>
<h2>Acceptance decision</h2><p><b>Retain native inference; keep this bridge experimental.</b> The 24-update/second goal and the original sub-100-ms delay target remain unmet. The main measured costs are OBS source snapshots, CPU/GPU transfers, native processing and delivery to a second renderer. Do not promote this as a finished green-screen replacement.</p>
<p>The next engineering gate is a direct capture/filter path with fewer frame copies, measured with a real Asphalt race. Fine hair, pale edge fringes, shirt erosion, hands against the background and leaving/re-entering the frame still need representative visual acceptance. The physical-camera still contained only a partial subject and is not a posed quality test.</p>
<h2>Recovery issue found and addressed</h2><p>One probe's final readback overlapped the following probe. The later physical-camera probe restored OBS but its HTTP server lingered on an idle socket and needed assisted process closure. Those runs are not counted as fully autonomous cleanup successes. A loopback guard now prevents overlapping probes, and shutdown explicitly destroys owned sockets.</p><p>The corrected worker/server lifecycle was then verified with an active viewer and an idle TCP connection: <b>{lifecycle['shutdownWithActiveViewerAndIdleSocketMs']} ms</b> shutdown, worker and server stopped. A foreign origin and an invalid session path were rejected. This is a separate lifecycle verification, not a rerun of the complete OBS probe.</p>
<p><a href="lifecycle.json">Lifecycle receipt</a> · <a href="{live['directory']}/restoration-audit.json">Independent OBS restoration audit</a> · <a href="{live['directory']}/alpha-verification.json">Alpha agreement</a> · <a href="../matting-evaluation-20261101/native/review.html">Earlier native inference comparison</a></p></html>'''
(OUT/'review.html').write_text(page,encoding='utf8')

ledger_path=ROOT/'design/background-removal-evidence.json'
ledger=json.loads(ledger_path.read_text())
entry=ledger['nativeIntegration']
completed=datetime.fromtimestamp((OUT/live['directory']/'results.json').stat().st_mtime,timezone.utc)
started=datetime.fromisoformat(entry['startedAt'].replace('Z','+00:00'))
entry.update(status='experimental_path_verified_performance_gates_unmet',probeCompletedAt=completed.isoformat(),probeMinutes=(completed-started).total_seconds()/60,
    report='.artifacts/native-integration-20261101/review.html',runs=runs,selectedLive=live,alphaAgreement=alpha,lifecycle=lifecycle,
    productionIntegrated=False,normalAppToggleUnchanged=True,paidApiCalls=0,
    criteria={'physicalSourceToOBS':'verified','softAlphaTransport':'exact final-frame agreement','24DeliveredFps':'not met','sub100msDelay':'not met; even lower-bound p95 is 140 ms','OBSRendering':'30 FPS, zero skipped frames over 20 seconds','AsphaltAndConcurrency':'not tested','representativeMotionQuality':'not validated on live camera','cleanup':'OBS independently audited intact; old server needed assisted closure. Corrected lifecycle passed separately.'},
    resourceState='All native workers and probe servers stopped. OBS remains open on the original scene, virtual camera restored; no stream/recording started.',
    recoveryFindings=['Old HTTP keep-alive socket prevented automatic test-server shutdown; assisted closure was required.','An overlapping next test caused a prior final scene readback to fail. The new OS-owned loopback guard covers cleanup too.','Corrected lifecycle explicitly closes owned sockets and stopped in 333 ms with a viewer and idle socket.'],
    verification={'existingSuite':'109/110 passed in sandbox; the sole failure was EACCES to a loopback test server. That single protocol test passed with loopback networking allowed.','newChecks':'Native worker+server lifecycle, wrong-origin rejection, invalid-path rejection, source-to-OBS alpha agreement, independent OBS restoration audit'},
    nextAction='Replace screenshot polling and separate renderer transport with a direct native capture/filter path before production integration. Then test actual Asphalt gameplay and posed movement; do not add more codecs or UI polish.')
ledger['stage']='Native source-to-OBS transport experiment complete; production integration deferred on performance and quality gates'
ledger['nextDecision']=entry['nextAction']
ledger['decision']='Retain native GPU inference. Physical source-to-OBS path works experimentally, but ~21 updates/s and 111/140 ms lower-bound delay do not meet the production gate. Preserve the existing app behavior.'
for criterion in ledger['acceptance']:
    if criterion['id']=='timing':criterion['status']='Native isolated processing improved to ~33 FPS. Physical source-to-OBS bridge delivered 20.6 updates/s with 111 ms median and 140 ms p95 request-to-canvas acknowledgement; physical camera-to-OBS presentation latency remains unmeasured.'
    if criterion['id']=='recovery':criterion['status']='Original OBS scene, camera transform, filters and virtual-camera state independently verified intact. Old probe server required assisted closure; corrected socket cleanup passed a separate actual worker/viewer lifecycle test.'
ledger['constraints']['currentScope']='Native DirectML experimental bridge authorized after retaining the approach; no production default promoted.'
ledger['constraints']['integrationBudgetReview']='Performance probes ended within the 35-minute budget; necessary cleanup diagnosis, fix verification and evidence recording continued afterward. No further performance trials or paid calls.'
ledger_path.write_text(json.dumps(ledger,indent=2)+'\n',encoding='utf8')
print(json.dumps({'report':str(OUT/'review.html'),'liveFps':live['deliveredFps'],'alphaMaxDifference':alpha['alphaMaxDifferenceOutOf255'],'probeMinutes':entry['probeMinutes']}))

# Judge proxy deployment

Render Web Service: Node runtime, root directory proxy, build command npm ci, start command npm start, health path /health.

Server secrets: OPENAI_API_KEY, SARVAM_API_KEY (optional), JUDGE_ACCESS_CODE (random 32+ characters). Never commit these values.
Optional MAX_REQUESTS defaults to 1000 total admitted requests per process lifetime; resets after restart. Maximum 40 requests/minute per network address, three concurrent transcription sockets, two-minute socket lifetime, 8 MB HTTP body limit. These are abuse controls, not a dollar spending cap. Set provider billing limits separately.

Desktop .env:
SCENESENSE_PROXY_URL=https://YOUR-SERVICE.onrender.com
SCENESENSE_JUDGE_CODE=YOUR_PRIVATE_ACCESS_CODE
VOICE_PROVIDER=sarvam
VOICE_LANGUAGE=en-IN

Use VOICE_PROVIDER=openai if Sarvam is not configured. No provider keys belong in the judge desktop .env.
Keep the access code private; anyone holding it can consume the service quota.
Free hosting can sleep; warm /health before testing. Verify host supports WebSockets and current plan terms before deployment.
Local tests cover client compatibility and route/auth checks. Live provider end-to-end validation is still required.

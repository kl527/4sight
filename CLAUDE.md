remember to always do `git pull --rebase` before pushing because we're just all committing to trunk

if you're committing and pushing any backend changes, you should use gh cli to watch GHA cd action and make sure it passes.

if you're debugging prod issues, use `uv run modal` and `source ~/.env.local && npx wrangler` clis, e.g., `source ~/.env.local && npx wrangler containers logs foresight-backend`

the way we test the websocket endpoint in prod is with `uv run --with websockets ./backend/scripts/replay_video_to_vision_ws.py --url https://foresight-backend.jun-871.workers.dev --video /home/ben/Downloads/vid.mp4 --magic-word <ask_the_user>`

to test the D1 biometric upload endpoint in prod:
1. apply migrations: `source ~/.env.local && cd backend/worker && npx wrangler d1 migrations apply foresight-biometrics --remote`
2. POST to `/biometrics/upload` with `x-magic-word` header and a JSON body containing `windowId`, `timestamp`, `durationMs`, `qualityScore`, and any feature fields
3. verify rows: `source ~/.env.local && cd backend/worker && npx wrangler d1 execute foresight-biometrics --remote --command "SELECT * FROM biometric_windows ORDER BY id DESC LIMIT 5"`
4. re-send the same `windowId` to confirm idempotency (`INSERT OR IGNORE` should silently skip duplicates)

to trigger an intervention in prod (upload unhealthy biometrics + food caption, then wait for cron):

1. upload unhealthy biometrics:
```bash
curl -X POST https://foresight-backend.jun-871.workers.dev/biometrics/upload \
  -H "Content-Type: application/json" \
  -H "x-magic-word: <ask_the_user>" \
  -d '{
    "windowId": "unhealthy-test-'"$(date +%s)"'",
    "timestamp": '"$(date +%s%3N)"',
    "durationMs": 60000,
    "qualityScore": 0.92,
    "hrMean": 142,
    "hrStd": 38,
    "hrMin": 98,
    "hrMax": 185,
    "meanRR": 422,
    "sdnn": 18,
    "rmssd": 12,
    "pnn50": 4.2,
    "pnn20": 11.5,
    "cvnn": 0.042,
    "cvsd": 0.028,
    "medianRR": 415,
    "rangeRR": 380,
    "movementIntensity": 0.002,
    "accelEnergy": 12.5,
    "peakCount": 142,
    "validRRCount": 140,
    "riskPrediction": {
      "riskAssessment": {
        "stress": {"level": 3, "label": "High Risk", "confidence": 0.89},
        "health": {"level": 3, "label": "High Risk", "confidence": 0.85},
        "sleepFatigue": {"level": 2, "label": "Moderate Risk", "confidence": 0.72},
        "cognitiveFatigue": {"level": 2, "label": "Moderate Risk", "confidence": 0.68},
        "physicalExertion": {"level": 0, "label": "No Risk", "confidence": 0.91}
      },
      "overallSusceptibility": 0.82,
      "alertLevel": "CRITICAL ALERT",
      "timeToRiskMinutes": 4.5
    }
  }'
```

2. upload unhealthy food caption:
```bash
curl -X POST https://foresight-backend.jun-871.workers.dev/captions/upload \
  -H "Content-Type: application/json" \
  -H "x-magic-word: <ask_the_user>" \
  -d '{
    "windowId": "unhealthy-caption-'"$(date +%s)"'",
    "timestamp": '"$(date +%s%3N)"',
    "chunkStartS": 0,
    "chunkEndS": 5,
    "caption": "User is eating a large deep-fried bacon cheeseburger with extra cheese, a side of loaded cheese fries, and drinking a 32oz sugary soda. They are sitting on the couch and have not moved in over an hour.",
    "latencyMs": 320,
    "tokensGenerated": 45
  }'
```

3. wait up to 60s for cron, then check interventions:
```bash
source ~/.env.local && cd backend/worker && npx wrangler d1 execute foresight-biometrics --remote --command "SELECT * FROM interventions ORDER BY id DESC LIMIT 3"
```

# 4sight — hackathon project

AI health agent that uses real-time biometrics to scare people into being healthy. Think Duolingo's guilt-tripping but for your lifespan. Target demo: biohackers & Bryan Johnson types.

## how it works

- Observes user behavior (food via Meta Ray-Bans CV, weight, diet, activity)
- Runs a scolding AI personality that calculates live lifespan estimates
- Sends fear-driven health nudges via iMessage (through Poke — no frontend needed)
- HeyGen avatar visually reflects health state (buff when healthy, deteriorates when not)
- Mortality math grounded in clinical data from OpenEvidence

## demo moment

User puts on Ray-Bans → agent scans their food → lifespan ticker updates on screen → user gets an iMessage like "that burrito just cost you 45 minutes" → HeyGen avatar ages visibly → user does jumping jacks → "+12 minutes back" → avatar perks up. 60 seconds, fully autonomous.

## tech stack

- **Backend**: FastAPI (Python, uv) deployed to Cloudflare Containers
- **Agent loop**: custom event-driven background loop — triggers on new data (food scan, weight, activity)
- **Messaging**: Poke API for iMessage delivery (https://poke.com/docs/developers/api/message-poke)
- **AI**: Claude (eligible for Anthropic tracks: Human Flourishing + Best Use of Claude Agent SDK)
- **Avatar**: HeyGen API — real-time video avatar that reacts to health events (https://docs.heygen.com/docs/quick-start)
- **CV**: Meta Ray-Bans for food recognition (https://wearables.developer.meta.com/docs/develop)
- **Clinical data**: OpenEvidence for mortality rates & clinical credibility (https://www.openevidence.com/)

## expo builds

set `FORESIGHT_MAGIC_WORD` env var before running expo prebuild/build — it's injected via `4sight/app.config.ts` and must not be committed to source.

## repo structure

- `backend/` — FastAPI app + worker (Python/uv)
- `firmware/` — firmware-related code
- `.github/` — CI/CD (deploys backend to Cloudflare Containers)
- `.agents/` — Claude agent configs

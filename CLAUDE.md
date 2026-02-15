remember to always do `git pull --rebase` before pushing because we're just all committing to trunk

if you're committing and pushing any backend changes, you should use gh cli to watch GHA cd action and make sure it passes.

if you're debugging prod issues, use `uv run modal` and `source ~/.env.local && npx wrangler` clis, e.g., `source ~/.env.local && npx wrangler containers logs foresight-backend`

the way we test the websocket endpoint in prod is with `uv run --with websockets ./backend/scripts/replay_video_to_vision_ws.py --url https://foresight-backend.jun-871.workers.dev --video /home/ben/Downloads/vid.mp4 --magic-word <ask_the_user>`

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

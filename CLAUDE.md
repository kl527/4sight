remember to always do `git pull --rebase` before pushing because we're just all committing to trunk

if you're committing and pushing any backend changes, you should use gh cli to watch GHA cd action and make sure it passes.

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

## repo structure

- `backend/` — FastAPI app + worker (Python/uv)
- `firmware/` — firmware-related code
- `.github/` — CI/CD (deploys backend to Cloudflare Containers)
- `.agents/` — Claude agent configs

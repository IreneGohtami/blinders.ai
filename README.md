# Blinders.ai

## Local Development
Create a `.env.local` file in the root directory and define your next.js / public keys:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SCRAPER_API_KEY=
NEXT_PUBLIC_GOOGLE_AUTH_CLIENT_ID=
GOOGLE_AUTH_CLIENT_SECRET=
SUPABASE_SERVICE_ROLE_KEY=
MODAL_WEBHOOK_URL=
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

## Scripts

Create another `.env.local` file inside /scripts directory.
```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
YOUTUBE_API_KEY=
HF_TOKEN=
```
The scripts are set to run automatically via Github scheduler which is configured inside `.github/workflows/`

### Web Scraper (Nodejs)
#### To run Youtube web scraper locally:
```bash
node ./scripts/youtube_scraping.js
```

### Model Training (Python)
1. Ensure you have python installed, version 3.11 is preferred
2. Install requirements:
  - `pip install -r requirements.txt`
3. Run model training script locally:
  - `python ./scripts/training/train_model.py`


### Video Analyzing (Python)
1. Check above pre-requisites to run python scripts locally
2. Update the video url (search `youtube_url`) that you want to analyze; currently supports youtube video
3. If using Hugging Face's Mistral or Llama model:
  - First, you will need to generate access token [here](https://huggingface.co/settings/tokens)
  - Then, authenticate via cmd: `hf auth login` and paste your token
  - Once successful, it will save your token locally in cache
  - Grant access to the model repository, example: https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.2
  - Set the `HF_TOKEN` env in your .env.local
4. Run script locally:
  - `python ./scripts/analyzing/analyze_video.py`


## Frontend Deployment via Vercel
Continuous deployment will be triggered whenever there's a push to `main` branch.

Url: [webapp](my-supabase-2y3owejz8-irenegohtamis-projects.vercel.app)

### Backend & Storage via Supabase
### Modal functions for python ML processes via FastAPI
To deploy app via cmd:
```
modal deploy ./scripts/analyzing/modal_video_analyzer.py
```

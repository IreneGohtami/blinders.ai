This is a [Next.js](https://nextjs.org) project bootstrapped with Supabase framework.

## Local Development
Create a `.env.local` file in the root directory and define your next.js / public keys:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SCRAPER_API_KEY=
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
OPENAI_API_KEY=
```
The scripts are set to run automatically via Github scheduler which is configured inside `.github/workflows/`

### Web Scraper
#### To run Youtube web scraper locally:
```bash
node ./scripts/youtube-scraping.js
```

### Python Model Training
1. Ensure you have python installed, version 3.11 is preferred
2. Install requirements:
  - `pip install -r requirements.txt`
3. Run model training script locally:
  - `python ./scripts/training/train-model.py`


## Frontend Deployment via Vercel
Continuous deployment will be triggered whenever there's a push to `main` branch.

Url: [webapp](my-supabase-2y3owejz8-irenegohtamis-projects.vercel.app)

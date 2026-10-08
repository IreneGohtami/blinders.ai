import fetch from "node-fetch";
//import 'dotenv/config';
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

const scraperApiKey = process.env.NEXT_PUBLIC_SCRAPER_API_KEY;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function scrapeVideos({ platform, hashtag }) {
  const targetUrl = `https://www.youtube.com/results?search_query=%23${encodeURIComponent(hashtag)}`;
  const scrapeUrl = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(targetUrl)}`;

  console.log(`Scraping: ${targetUrl}`);

  const res = await fetch(scrapeUrl);
  const html = await res.text();

  // Load HTML into cheerio for parsing
  const $ = cheerio.load(html);

  // Basic example: YouTube uses <a id="video-title" ...>
  const results = [];
  $('a#video-title').each((_, el) => {
    const title = $(el).text().trim();
    const videoUrl = `https://www.youtube.com${$(el).attr('href')}`;
    results.push({ title, videoUrl });
  });

  console.log(`Found ${results.length} videos for hashtag ${hashtag}`);

  for (const video of results) {
    await supabase.from('scraped_videos').insert({
      platform,
      video_url: video.videoUrl,
      title: video.title,
      hashtags: hashtag,
      metadata: {}, // can store raw scrape metadata here
    });
  }
}

(async () => {
  const platformsToScrape = [
    { platform: 'youtube', hashtag: 'funnycats' },
    //{ platform: 'youtube', hashtag: 'travelvlog' }
  ];

  for (const job of platformsToScrape) {
    await scrapeVideos(job);
  }

  console.log('Scraping completed.');
})();
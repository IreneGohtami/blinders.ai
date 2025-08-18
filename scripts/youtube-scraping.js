import dotenv from 'dotenv';
dotenv.config({ path: path.resolve("scripts/.env.local") });

import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const MAX_VIDEO = 50; // highest limit for youtube API
const MAX_COMMENT = 100;

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchVideosByQuery(query) {
  // 1. Get existing pageToken
  const { data: state } = await supabase
  .from('youtube_scraper_state')
  .select('last_page_token')
  .eq('query', query)
  .single();

  let pageToken = state?.last_page_token || null;

  // 2. Search videos
  const searchRes = await youtube.search.list({
    part: 'snippet',
    q: `#${query}`,
    type: 'video',
    maxResults: MAX_VIDEO,
    pageToken,
    order: 'relevance',

  });

  const { nextPageToken } = searchRes.data;
  const videoIds = searchRes.data.items.map(item => item.id.videoId);

  // 3. Get video stats
  const videosRes = await youtube.videos.list({
    part: 'snippet,statistics,contentDetails,paidProductPlacementDetails,topicDetails,localizations',
    id: videoIds.join(',')
  });

  for (const vid of videosRes.data.items) {
    const channelId = vid.snippet.channelId;

    // 4. Get channel subscriber count
    const channelRes = await youtube.channels.list({
      part: 'statistics',
      id: channelId
    });
    const followerCount = parseInt(channelRes.data.items[0]?.statistics.subscriberCount) || 0;

    // 5. Fetch top-level comments
    let commentData = [];
    try {
      const commentsRes = await youtube.commentThreads.list({
        part: 'snippet',
        videoId: vid.id,
        maxResults: MAX_COMMENT
      });
      commentData = commentsRes.data.items.map(c => ({
        author: c.snippet.topLevelComment.snippet.authorDisplayName,
        text: c.snippet.topLevelComment.snippet.textOriginal,
        publishedAt: c.snippet.topLevelComment.snippet.publishedAt,
        likeCount: c.snippet.topLevelComment.snippet.likeCount
      }));
    } catch (err) {
      console.warn(`No comments for video ${vid.id} or comments disabled`);
    }

    vid.statistics.followerCount = followerCount;

    // Step 5: Insert into Supabase
    const { error } = await supabase.from('scraped_videos').insert({
      platform: 'youtube',
      video_id: vid.id,
      title: vid.snippet.title,
      tags: vid.snippet.tags,
      top_comments: commentData,
      metadata: vid
    });
    if (error) {
      console.error('Error inserting data:', error.message);
    } else {
      console.log('Data inserted successfully:', vid.snippet.title);
    }
  }

  // Finally, update last_page_token
  await supabase
  .from('youtube_scraper_state')
  .upsert({
    query,
    last_page_token: nextPageToken
  });
}

(async () => {
  const queryFromInput = process.env.QUERY?.trim();

  if (queryFromInput) {
    console.log(`Running youtube scraper for manual query: "${queryFromInput}"`);
    await fetchVideosByQuery(queryFromInput);
  }
  else {
    console.log('Running youtube scraper for scheduled queries')
    const configPath = path.resolve("scripts/config/youtube-queries.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    for (const query of config.queries) {
      await fetchVideosByQuery(query);
    }
  }
})();

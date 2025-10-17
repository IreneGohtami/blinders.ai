import sys
import os
from pathlib import Path
from supabase import create_client, Client
from dotenv import load_dotenv
from analyze_video import analyze_youtube_url
import yt_dlp

# Load environment variables
_script_dir_env = Path(__file__).parent.parent / ".env.local"
load_dotenv(_script_dir_env)

# Initialize Supabase client
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(url, key)

def get_video_metadata(video_url):
    """Extract video metadata using yt-dlp"""
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=False)

        return {
            'title': info.get('title', 'Unknown Title'),
            'duration': info.get('duration', 0),
            'thumbnail_url': info.get('thumbnail'),
            'channel': info.get('uploader', 'Unknown Channel'),
            'view_count': info.get('view_count', 0)
        }
    except Exception as e:
        print(f"Error extracting metadata: {e}")
        return {}

def update_video_record(record_id, updates):
    """Update video analysis record in Supabase"""
    try:
        result = supabase.table('video_analyses').update(updates).eq('id', record_id).execute()
        return result
    except Exception as e:
        print(f"Error updating record: {e}")
        return None

def main():
    if len(sys.argv) != 3:
        print("Usage: python analyze_video_api.py <video_url> <record_id>")
        sys.exit(1)

    video_url = sys.argv[1]
    record_id = sys.argv[2]

    try:
        print(f"Starting analysis for video: {video_url}")

        # Get video metadata first
        metadata = get_video_metadata(video_url)

        # Update record with metadata
        update_video_record(record_id, {
            'title': metadata.get('title'),
            'duration': metadata.get('duration'),
            'thumbnail_url': metadata.get('thumbnail_url'),
            'channel': metadata.get('channel'),
            'view_count': metadata.get('view_count')
        })

        # Perform analysis
        print("Starting video analysis...")
        analysis_result = analyze_youtube_url(video_url)
        print(f"Analysis result: {analysis_result[:100] if analysis_result else 'Empty result'}...")

        # Update record with results
        update_video_record(record_id, {
            'status': 'completed',
            'summary': analysis_result,
            'completed_at': 'now()'
        })

        print("Analysis completed successfully")

    except Exception as e:
        print(f"Analysis failed: {e}")
        import traceback
        traceback.print_exc()

        # Update record with error
        update_video_record(record_id, {
            'status': 'failed',
            'error_message': str(e)
        })

        sys.exit(1)

if __name__ == "__main__":
    main()
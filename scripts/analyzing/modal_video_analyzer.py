import modal
import os
from yt_utils import config_ydl_opts, map_youtube_category_to_id

# Create Modal app
app = modal.App("blinders-video-analyzer")

current_dir = os.path.dirname(os.path.abspath(__file__))

# Define image with dependencies and local files
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(["ffmpeg", "curl", "unzip"])
    .run_commands("curl -fsSL https://deno.land/install.sh | sh")
    .env({"PATH": "/root/.deno/bin:$PATH"})
    .pip_install(["fastapi", "fastapi[standard]"])
    .pip_install([
        "supabase",
        "yt-dlp>=2025.11.12",
        "opencv-python-headless",
        "easyocr",
        "moviepy",
        "python-dotenv",
        "faster-whisper",
        "torch",
        "transformers",
        "huggingface-hub",
        "joblib",
        "sentence-transformers",
        "lightgbm",
        "scikit-learn"
    ])
    .add_local_file(f"{current_dir}/analyze_video.py", remote_path="/root/analyze_video.py")
    .add_local_file(f"{current_dir}/model_selector.py", remote_path="/root/model_selector.py")
    .add_local_file(f"{current_dir}/yt_utils.py", remote_path="/root/yt_utils.py")
    .add_local_file(f"{current_dir}/video_forecaster.py", remote_path="/root/video_forecaster.py")
)

@app.function(
    image=image,
    timeout=1200,  # 20 minutes
    cpu=4,
    secrets=[
        modal.Secret.from_name("supabase-secrets"),
        modal.Secret.from_name("hf-token"),
        modal.Secret.from_name("custom-secret")
    ],
)
def process_video(video_url: str, record_id: str):
    import sys
    sys.path.append("/root")

    from supabase import create_client
    from analyze_video import analyze_youtube_url
    import yt_dlp

    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    supabase = create_client(supabase_url, supabase_key)

    def get_video_metadata(video_url):
        try:
            ydl_opts = config_ydl_opts(None, True)
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_url, download=False)

            from datetime import datetime
            published_at = info.get("upload_date")
            if published_at:
                dt = datetime.strptime(published_at, "%Y%m%d")
                upload_day_of_week = dt.weekday()
                upload_month = dt.month
            else:
                upload_day_of_week = upload_month = 0

            # upload_date doesn't have time, use timestamp if available
            timestamp = info.get("timestamp")
            if timestamp:
                upload_hour = datetime.fromtimestamp(timestamp).hour
            else:
                upload_hour = 12  # default to noon

            # Extract category_id safely
            category_id = 0
            categories = info.get("categories", [])
            category_id = map_youtube_category_to_id(categories[0]) if categories else 0

            # Data for database (only existing columns)
            db_metadata = {
                "title": info.get("title", "Unknown Title"),
                "duration": info.get("duration", 0),
                "thumbnail_url": info.get("thumbnail"),
                "channel": info.get("uploader", "Unknown Channel"),
                "view_count": info.get("view_count", 0),
            }

            # Data for forecaster (all features)
            forecast_metadata = {
                "follower_count": info.get("channel_follower_count", 0),
                "category_id": category_id,
                "platform_id": 1,
                "upload_day_of_week": upload_day_of_week,
                "upload_hour": upload_hour,
                "upload_month": upload_month,
            }

            return db_metadata, forecast_metadata
        except Exception as e:
            print(f"Metadata extraction failed: {e}")
            return {}, {"platform_id": 1}

    try:
        print(f"Starting analysis for video: {video_url}")

        db_metadata, forecast_metadata = get_video_metadata(video_url)
        combined_metadata = {**db_metadata, **forecast_metadata}
        print(f"Extracted metadata: {combined_metadata}")

        update_payload = {**db_metadata, "metadata": combined_metadata}
        supabase.table("video_analyses").update(update_payload).eq("id", record_id).execute()

        result = analyze_youtube_url(video_url, use_cookies=True, include_forecast=True, metadata=combined_metadata)
        print(f"Analysis result: {result}")

        from datetime import datetime
        update_data = {
            "status": "completed",
            "summary": result.get("summary"),
            "completed_at": datetime.now().isoformat()
        }

        if result.get("forecast"):
            update_data["forecast"] = result["forecast"]

        supabase.table("video_analyses").update(update_data).eq("id", record_id).execute()

        return {"success": True, "result": result}

    except Exception as e:
        import traceback
        error_msg = f"{type(e).__name__}: {str(e)}"
        print(f"Error occurred: {error_msg}")
        print(traceback.format_exc())
        supabase.table("video_analyses").update(
            {"status": "failed", "error_message": error_msg}
        ).eq("id", record_id).execute()
        return {"success": False, "error": error_msg}

'''
@app.function(image=image, timeout=60, secrets=[modal.Secret.from_name("supabase-secrets")])
def monitor_job(job_id: str, record_id: str):
    from supabase import create_client

    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    supabase = create_client(supabase_url, supabase_key)

    try:
        # Wait for job completion with timeout
        job = modal.Function.lookup("blinders-video-analyzer", "process_video")
        result = job.get(job_id, timeout=1200)  # 20 min timeout
        return result
    except Exception as e:
        # Job failed, timed out, or was cancelled
        error_msg = f"Job failed: {str(e)}"
        supabase.table("video_analyses").update({
            "status": "failed",
            "error_message": error_msg
        }).eq("id", record_id).execute()
        return {"error": error_msg}
'''

@app.function(image=image)
@modal.fastapi_endpoint(method="POST")
def analyze_video_api_url(data: dict):
    video_url = data.get("video_url")
    record_id = data.get("record_id")

    if not video_url or not record_id:
        return {"error": "Missing video_url or record_id"}, 400

    job = process_video.spawn(video_url, record_id)
    #monitor_job.spawn(job.object_id, record_id)

    return {
        "success": True,
        "message": "Video analysis started",
        "job_id": job.object_id,
    }

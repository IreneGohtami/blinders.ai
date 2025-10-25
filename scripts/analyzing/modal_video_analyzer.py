import modal
import os
from yt_utils import config_ydl_opts

# Create Modal app
app = modal.App("blinders-video-analyzer")

current_dir = os.path.dirname(os.path.abspath(__file__))

# Define image with dependencies and local files
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(["ffmpeg"])
    .pip_install(["fastapi", "fastapi[standard]"])
    .pip_install([
        "supabase",
        "yt-dlp==2025.10.22", # Reminder: have to use latest version
        "opencv-python-headless",
        "easyocr",
        "moviepy",
        "python-dotenv",
        "faster-whisper",
        "torch",
        "transformers",
        "huggingface-hub",
        #"ctranslate2==4.4.0"
    ])
    .add_local_file(f"{current_dir}/analyze_video.py", remote_path="/root/analyze_video.py")
    .add_local_file(f"{current_dir}/model_selector.py", remote_path="/root/model_selector.py")
    .add_local_file(f"{current_dir}/yt_utils.py", remote_path="/root/yt_utils.py")
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
            ydl_opts = config_ydl_opts()
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_url, download=False)
            return {
                "title": info.get("title", "Unknown Title"),
                "duration": info.get("duration", 0),
                "thumbnail_url": info.get("thumbnail"),
                "channel": info.get("uploader", "Unknown Channel"),
                "view_count": info.get("view_count", 0),
            }
        except Exception as e:
            print(f"Metadata extraction failed: {e}")
            return {}

    try:
        print(f"Starting analysis for video: {video_url}")

        metadata = get_video_metadata(video_url)
        supabase.table("video_analyses").update(metadata).eq("id", record_id).execute()

        result = analyze_youtube_url(video_url)

        supabase.table("video_analyses").update(
            {"status": "completed", "summary": result}
        ).eq("id", record_id).execute()

        return {"success": True, "summary": result}

    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)}"
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

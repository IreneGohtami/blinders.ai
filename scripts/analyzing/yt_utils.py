import os
import base64
import tempfile

def write_cookies_from_secret():
    """Write cookies from base64 encoded environment variable to temp file"""
    b64 = os.environ.get("YT_COOKIES_B64")
    if not b64:
        try:
            print("No cookies found in environment variable, trying to read from file")
            with open("../cookies.b64", "r") as f:
                b64 = f.read().strip()
        except FileNotFoundError:
            b64 = None

    if not b64:
        print("No cookies found")
        return None

    tmp = tempfile.NamedTemporaryFile(suffix=".txt", delete=False)
    tmp_path = tmp.name
    tmp.close()
    with open(tmp_path, "wb") as f:
        f.write(base64.b64decode(b64))
        print(f"Wrote cookies to temporary file: {tmp_path}")
    return tmp_path

def config_ydl_opts(output_path=None, pass_cookies=False):
    cookie_path = write_cookies_from_secret() if pass_cookies else None

    opts = {
        "format": "bestvideo[ext=mp4][vcodec!*=av01][vcodec!*=vp9]+bestaudio[ext=m4a]/best[ext=mp4]/best", # Use single format to avoid merging
        "outtmpl": output_path,
        "quiet": True,
        "noplaylist": True,
        "nocheckcertificate": True,
        "remote_components": ["ejs:github"]
    }

    if cookie_path:
        opts["cookiefile"] = cookie_path

    return opts

def map_youtube_category_to_id(category_name):
    """Map YouTube category name to ID (partial list)"""
    category_map = {
        "Film & Animation": 1,
        "Autos & Vehicles": 2,
        "Music": 10,
        "Pets & Animals": 15,
        "Sports": 17,
        "Short Movies": 18,
        "Travel & Events": 19,
        "Gaming": 20,
        "Videoblogging": 21,
        "People & Blogs": 22,
        "Comedy": 23,
        "Entertainment": 24,
        "News & Politics": 25,
        "Howto & Style": 26,
        "Education": 27,
        "Science & Technology": 28,
        "Nonprofits & Activism": 29,
        "Movies": 30,
        "Anime/Animation": 31,
        "Action/Adventure": 32,
        "Classics": 33,
        "Documentary": 35,
        "Drama": 36,
        "Family": 37,
        "Foreign": 38,
        "Horror": 39,
        "Sci-Fi/Fantasy": 40,
        "Thriller": 41,
        "Shorts": 42,
        "Shows": 43,
        "Trailers": 44
    }
    return category_map.get(category_name, 0)  # Return 0 if not found
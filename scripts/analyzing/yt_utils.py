import os
import base64
import tempfile

def write_cookies_from_secret():
    """Write cookies from base64 encoded environment variable to temp file"""
    if os.getenv("NODE_ENV") == "production":
        b64 = os.environ.get("YT_COOKIES_B64")
    else:
        try:
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

def config_ydl_opts():
    tmp_dir = tempfile.mkdtemp()
    output_path = os.path.join(tmp_dir, "%(id)s.%(ext)s")
    cookie_path = write_cookies_from_secret()

    return {
        "format": (
            "bestvideo[ext=mp4][vcodec!*=av01][vcodec!*=vp9]"
            "+bestaudio[ext=m4a]/best[ext=mp4]/best"
        ),
        "merge_output_format": "mp4",
        #"format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "outtmpl": output_path,
        "quiet": False, # for debugging
        "noplaylist": True,
        "nocheckcertificate": True,
        "cookiefile": cookie_path
    }
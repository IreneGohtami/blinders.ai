"""
To use ytl-dlp library, we need to extract cookies from Chrome, filter them, base64 encode, and update Modal secret.
Or, go to Chrome Incognito, open youtube.com and login, then navigate to https://www.youtube.com/robots.txt.
Use the Get cookies extension to export cookies, then base64 encode and update Modal secret manually.
"""
#!/usr/bin/env python3
import subprocess
import base64
import os
from pathlib import Path

def refresh_cookies():
    script_dir = Path(__file__).parent
    cookies_file = script_dir / "cookies.txt"
    b64_file = script_dir / "cookies.b64"

    # Run yt-dlp to extract cookies from Chrome
    cmd = [
        "yt-dlp",
        "--cookies-from-browser", "chrome",
        "--cookies", str(cookies_file),
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "--skip-download"
    ]

    try:
        print("Extracting cookies from Chrome...")
        subprocess.run(cmd, check=True, capture_output=True)

        if not cookies_file.exists():
            raise FileNotFoundError("cookies.txt was not created")

        # Filter essential YouTube cookies
        essential_domains = [
            ".youtube.com",
            ".google.com",
            ".googleusercontent.com",
            ".googlevideo.com",
            "accounts.google.com",
        ]
        essential_names = [
            # Core YouTube
            "VISITOR_INFO1_LIVE",
            "YSC",
            "PREF",
            "CONSENT",
            "GPS",

            # Auth tokens
            "__Secure-3PSID",
            "__Secure-3PSIDCC",
            "__Secure-1PSID",
            "__Secure-3PAPISID",
            "__Secure-3PSIDTS",
            "SAPISID",
            "APISID",
            "HSID",
            "SSID",
            "SID",
            "SIDCC",
            "LOGIN_INFO",
        ]

        filtered_lines = []
        with open(cookies_file, 'r') as f:
            for line in f:
                if line.startswith('#') or not line.strip():
                    filtered_lines.append(line)
                    continue

                parts = line.strip().split('\t')
                if len(parts) >= 7:
                    domain = parts[0]
                    name = parts[5]

                    if any(d in domain for d in essential_domains) or name in essential_names:
                        filtered_lines.append(line)

        # Write filtered cookies
        filtered_content = ''.join(filtered_lines)
        with open(cookies_file, 'w') as f:
            f.write(filtered_content)

        # Base64 encode and save
        b64_content = base64.b64encode(filtered_content.encode()).decode()
        with open(b64_file, 'w') as f:
            f.write(b64_content)

        print(f"✅ Cookies refreshed and saved to {b64_file}")
        print(f"📋 Base64 content: {b64_content[:50]}...")

        # Update Modal secret
        if (os.environ.get('NODE_ENV') == 'development'):
            print("⚠️ Skipping Modal secret update in development environment")
            return
        try:
            modal_cmd = [
                "modal", "secret", "create", "custom-secret",
                f"YT_COOKIES_B64={b64_content}", "--force"
            ]
            subprocess.run(modal_cmd, check=True, capture_output=True)
            print("🚀 Modal secret updated successfully")

            # Deploy Modal app
            analyzing_dir = script_dir / "analyzing"
            deploy_cmd = ["modal", "deploy", "modal_video_analyzer.py"]
            subprocess.run(deploy_cmd, check=True, capture_output=True, cwd=analyzing_dir)
            print("🚀 Modal app deployed successfully")

        except subprocess.CalledProcessError as e:
            print(f"⚠️ Failed to update Modal secret or deploy: {e}")
            print("💡 Run manually: modal secret create custom-secret YT_COOKIES_B64=<base64_content> --force")

    except subprocess.CalledProcessError as e:
        print(f"❌ yt-dlp failed: {e}")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    refresh_cookies()
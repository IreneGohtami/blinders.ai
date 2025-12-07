import os
import cv2
import easyocr
import moviepy as mp
import re
import tempfile
import yt_dlp
from dotenv import load_dotenv
from faster_whisper import WhisperModel
from model_selector import load_model
from yt_utils import config_ydl_opts
from pathlib import Path
from transformers import BlipProcessor, BlipForConditionalGeneration

_script_dir_env = Path(__file__).parent.parent / ".env.local"
load_dotenv(_script_dir_env)

# ---------- Step 0: Download video from YouTube ----------
def download_youtube_video(url, use_cookies=False):
    tmp_dir = tempfile.mkdtemp()
    output_path = os.path.join(tmp_dir, "%(id)s.%(ext)s")
    ydl_opts = config_ydl_opts(output_path, use_cookies)

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        ext = info.get("ext", "mp4")
        filepath = os.path.join(tmp_dir, f"{info['id']}.{ext}")

    return filepath

# ---------- Step 1: Extract frames ----------
def extract_frames(video_path, fps=1, max_duration=120):
    cap = cv2.VideoCapture(video_path)
    frames = []
    count = 0
    frame_rate = int(cap.get(cv2.CAP_PROP_FPS)) // fps
    max_frames = max_duration * cap.get(cv2.CAP_PROP_FPS)

    while cap.isOpened() and count < max_frames:
        ret, frame = cap.read()
        if not ret:
            break
        if count % frame_rate == 0:
            frames.append(frame)
        count += 1
    cap.release()
    return frames

# ---------- Step 2: Frame captioning ----------
blip_processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base", use_fast=True)
blip_model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base")

def caption_frames(frames):
    captions = []
    for frame in frames:
        inputs = blip_processor(images=frame, return_tensors="pt")
        out = blip_model.generate(**inputs, max_new_tokens=20)
        cap = blip_processor.decode(out[0], skip_special_tokens=True)
        captions.append(cap)
    return captions

# ---------- Step 3: Audio transcription ----------
whisper_model = WhisperModel(
    "medium",
    device="cpu",
    compute_type="int8"
)

def transcribe_audio(video_path, max_duration=120):
    # Extract audio from video (limit to first 2 minutes)
    video = mp.VideoFileClip(video_path)
    if video.duration > max_duration:
        video = video.subclipped(0, max_duration)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        audio_path = tmp.name
        video.audio.write_audiofile(audio_path, logger=None)

    # Transcribe with faster-whisper
    segments, _ = whisper_model.transcribe(audio_path)
    transcript = " ".join([segment.text for segment in segments])

    os.remove(audio_path)
    return transcript

# ---------- Step 4: OCR on frames ----------
def extract_ocr(frames):
    reader = easyocr.Reader(["en"])
    texts = []
    for i, frame in enumerate(frames[:50]):  # Limit to first 50 frames
        try:
            results = reader.readtext(frame)
            for _, text, conf in results:
                if conf > 0.5:
                    texts.append(text)
        except Exception as e:
            print(f"OCR failed on frame {i}: {e}")
            continue
    return texts

def _clean_and_deduplicate_transcript(transcript_text, min_sentence_len=15):
    if not transcript_text: return ""
    sentences = re.split(r'(?<=[.!?])\s+', transcript_text)
    unique_sentences = set()
    cleaned_sentences = []
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence: continue
        if len(sentence) < min_sentence_len: continue
        alpha_chars = sum(c.isalpha() for c in sentence)
        if len(sentence) > 0 and (alpha_chars / len(sentence)) < 0.5: continue
        lower_sentence = sentence.lower()
        if lower_sentence not in unique_sentences:
            unique_sentences.add(lower_sentence)
            cleaned_sentences.append(sentence)
    return " ".join(cleaned_sentences)

# ---------- Step 5: Combine + summarize ----------
def analyze_video(video_path):
    print(f"🎬 Extracting frames from: {video_path}")
    frames = extract_frames(video_path, fps=1)  # Adjust FPS if it's a faster transition videos like shorts / reels / music videos
    print(f"Extracted {len(frames)} frames")

    print("🖼️ Captioning frames...")
    captions = caption_frames(frames)
    print(f"Generated {len(captions)} captions")

    print("🔊 Transcribing audio...")
    try:
        transcript = transcribe_audio(video_path)
        print(f"Transcript length: {len(transcript)}")
    except Exception as e:
        print(f"Audio transcription failed: {e}")
        transcript = ""

    print("🔡 Extracting OCR texts...")
    ocr_texts = extract_ocr(frames)
    print(f"Extracted {len(ocr_texts)} OCR texts")

    # Clean and deduplicate sentences in the transcript
    cleaned_transcript = _clean_and_deduplicate_transcript(transcript, min_sentence_len=15)

    combined_text = (
        "Frame captions:\n" + " | ".join(captions) + "\n\n"
        "Transcript:\n" + cleaned_transcript + "\n\n"
        "On-screen text:\n" + " | ".join(ocr_texts)
    )

    print(f"\n\nCombined text length: {len(combined_text)}")
    print(f"Captions count: {len(captions)}")
    print(f"Transcript length: {len(cleaned_transcript)}")
    print(f"OCR texts count: {len(ocr_texts)}")
    print("Combined text preview:", combined_text[:200], "\n\n")

    if not combined_text.strip() or len(combined_text.strip()) < 50:
        raise ValueError("Unable to analyze video: insufficient content extracted from video.")

    # Truncate if too long for API (keep first 8000 chars)
    if len(combined_text) > 8000:
        combined_text = combined_text[:8000] + "\n\n[Content truncated due to length]"
        print(f"Truncated combined text to {len(combined_text)} characters")

    print("🧠 Summarizing with LLM...")
    summarized_texts = load_model(3, combined_text)  # Experiment with different models here
    return summarized_texts

# ---------- Full pipeline from URL ----------
def analyze_youtube_url(url, use_cookies=False):
    print(f"⬇️ Downloading {url} ...")
    video_path = download_youtube_video(url, use_cookies=use_cookies)
    print(f"Downloaded to: {video_path}")

    if not os.path.exists(video_path):
        raise Exception("Video download failed")

    try:
        summary = analyze_video(video_path)
    finally:
        # Clean up temp file
        if os.path.exists(video_path):
            os.remove(video_path)
            print("Cleaned up temporary file")

    return summary

# ---------- Run ----------
if __name__ == "__main__":
    youtube_url = "https://www.youtube.com/shorts/DRtqJBXGT4M"
    # To check if video download works, try: yt-dlp --list-formats <url>
    result = analyze_youtube_url(youtube_url)
    print("\n===== VIDEO ANALYSIS =====")
    print(result)

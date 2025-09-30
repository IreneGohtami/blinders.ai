import cv2
import easyocr
import moviepy as mp
import os
import re
import tempfile
import yt_dlp
#from openai import OpenAI
from dotenv import load_dotenv
from faster_whisper import WhisperModel
from model_selector import load_model
from pathlib import Path
from transformers import BlipProcessor, BlipForConditionalGeneration

_script_dir_env = Path(__file__).parent.parent / ".env.local"
load_dotenv(_script_dir_env)
#openAIClient = OpenAI()

# ---------- Step 0: Download video from YouTube ----------
def download_youtube_video(url):
    tmp_dir = tempfile.mkdtemp()
    output_path = os.path.join(tmp_dir, "%(id)s.%(ext)s")

    ydl_opts = {
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "outtmpl": output_path,
        "quiet": True,
        "noplaylist": True,
        "nocheckcertificate": True,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        ext = info.get("ext", "mp4")
        filepath = os.path.join(tmp_dir, f"{info['id']}.{ext}")

    return filepath

# ---------- Step 1: Extract frames ----------
def extract_frames(video_path, fps=1):
    cap = cv2.VideoCapture(video_path)
    frames = []
    count = 0
    frame_rate = int(cap.get(cv2.CAP_PROP_FPS)) // fps
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        if count % frame_rate == 0:
            frames.append(frame)
        count += 1
    cap.release()
    return frames

# ---------- Step 2: Frame captioning ----------
blip_processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
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
    "medium"
)

def transcribe_audio(video_path):
    # Extract audio from video
    video = mp.VideoFileClip(video_path)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        audio_path = tmp.name
        video.audio.write_audiofile(audio_path, verbose=False, logger=None)

    # Transcribe with faster-whisper
    segments = whisper_model.transcribe(audio_path)
    transcript = " ".join([segment.text for segment in segments])

    os.remove(audio_path)
    return transcript

# ---------- Step 4: OCR on frames ----------
def extract_ocr(frames):
    reader = easyocr.Reader(["en"])
    texts = []
    for frame in frames:
        results = reader.readtext(frame)
        for _, text, conf in results:
            if conf > 0.5:
                texts.append(text)
    return texts

def _filter_gibberish_texts(texts, min_len=3, min_alpha_ratio=0.5):
    cleaned_texts = []
    for text in texts:
        text = text.strip()
        if not text: continue
        if len(text) < min_len: continue
        alpha_chars = sum(c.isalpha() for c in text)
        if len(text) > 0 and (alpha_chars / len(text)) < min_alpha_ratio: continue
        cleaned_texts.append(text)
    return cleaned_texts

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
    print("🎬 Extracting frames...")
    frames = extract_frames(video_path, fps=1)  # Adjust FPS if it's a faster transition videos like shorts / reels / music videos

    print("🖼️ Captioning frames...")
    captions = caption_frames(frames)

    print("🔊 Transcribing audio...")
    try:
        transcript = transcribe_audio(video_path)
    except:
        transcript = ""

    print("🔡 Extracting OCR texts...")
    ocr_texts = extract_ocr(frames)

    # Tidy up texts before combining
    # Remove gibberish from captions and OCR texts
    cleaned_captions = captions #_filter_gibberish_texts(captions, min_len=5)
    cleaned_ocr_texts = ocr_texts #_filter_gibberish_texts(ocr_texts, min_len=3)

    # Clean and deduplicate sentences in the transcript
    cleaned_transcript = _clean_and_deduplicate_transcript(transcript, min_sentence_len=15)

    combined_text = (
        "Frame captions:\n" + " | ".join(cleaned_captions) + "\n\n"
        "Transcript:\n" + cleaned_transcript + "\n\n"
        "On-screen text:\n" + " | ".join(cleaned_ocr_texts)
    )

    print("\n\n", combined_text, "\n\n")

    print("🧠 Summarizing with LLM...")
    summarized_texts = load_model(3, combined_text)  # Experiment with different models here
    return summarized_texts

# ---------- Full pipeline from URL ----------
def analyze_youtube_url(url):
    print(f"⬇️ Downloading {url} ...")
    video_path = download_youtube_video(url)

    try:
        summary = analyze_video(video_path)
    finally:
        # Clean up temp file
        if os.path.exists(video_path):
            os.remove(video_path)

    return summary

# ---------- Run ----------
if __name__ == "__main__":
    youtube_url = "https://www.youtube.com/watch?v=k6K196GrqG0"
    # To check if video download works, try: yt-dlp --list-formats <url>
    result = analyze_youtube_url(youtube_url)
    print("\n===== VIDEO ANALYSIS =====")
    print(result)

import clip
import io
import joblib
import lightgbm as lgb
import numpy as np
import os
import pandas as pd
import subprocess
import torch
from dotenv import load_dotenv
from pathlib import Path
from PIL import Image
from supabase import create_client, Client
from sklearn.decomposition import PCA
from sklearn.linear_model import SGDRegressor
from sklearn.metrics import mean_squared_error
from sklearn.model_selection import train_test_split
from sklearn.multioutput import MultiOutputRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.preprocessing import normalize as l2norm
from sentence_transformers import SentenceTransformer
from transformers import pipeline
from platform_mapper import get_platform_id

# Load .env.local from scripts/
_script_dir_env = Path(__file__).parent.parent / ".env.local"
load_dotenv(_script_dir_env)

sentiment_pipeline = pipeline("sentiment-analysis", model="distilbert-base-uncased-finetuned-sst-2-english", revision="main")

# Connect to Supabase
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(url, key)

# Fetch dataset from your scraped table with pagination
page_size = 100
page = 0

# Fetch untrained data from DB
from datetime import datetime, timedelta
n_days_ago = (datetime.now() - timedelta(days=90)).isoformat()
response = supabase.table("scraped_videos").select("*") \
  .eq('trained_with', 0) \
  .lte('published_at', n_days_ago) \
  .range(page * page_size, (page + 1) * page_size - 1) \
  .execute()

df = pd.DataFrame(response.data)

def get_model_from_storage(model_name, bucket="models"):
  remote_path = f"{model_name}.pkl"
  init_model = None

  try:
    res = supabase.storage.from_(bucket).download(remote_path)
    if res:
      init_model = joblib.load(io.BytesIO(res))
      print(f"🔄 Loaded existing model for {model_name}.pkl from Supabase")
  except Exception as e:
    print(f"⚠️ No existing model found for {model_name}.pkl, training from scratch. ({e})")

  return init_model

def upload_model_to_storage(model, model_name, bucket="models"):
  # Save model locally
  local_path = f"artifacts/{model_name}.pkl"  # artifacts is the temp directory within the github actions container
  os.makedirs("artifacts", exist_ok=True)
  joblib.dump(model, local_path)

  # Upload/overwrite to Supabase
  with open(local_path, "rb") as f:
    remote_path = f"{model_name}.pkl"
    supabase.storage.from_(bucket).upload(
      remote_path,
      f,
      {"upsert": "true", "content-type": "application/octet-stream"}
    )

  print(f"✅ Updated model {model_name}.pkl to Supabase")

# Can use: "all-MiniLM-L6-v2" (small, fast), or "BAAI/bge-small-en-v1.5" (newer, better)
model = SentenceTransformer("all-MiniLM-L6-v2")

"""
--- Video & Audio Extraction ---
"""
clip_model, preprocess = clip.load("ViT-B/32", device="cpu")

def extract_thumbnail_embedding(thumb_path):
  if thumb_path is None:
    return None
  image = preprocess(Image.open(thumb_path)).unsqueeze(0)
  with torch.no_grad():
    return clip_model.encode_image(image).cpu().numpy().flatten()

def extract_subtitle_embedding(sub_path):
  if sub_path is None:
    return None
  with open(sub_path, "r", encoding="utf-8") as f:
    text = f.read()
  return model.encode(text, convert_to_numpy=True, normalize_embeddings=True)

def fetch_video_assets(video_id, outdir="artifacts"):
  # Fetch thumbnail + auto-subs (if available) for a YouTube video_id
  url = f"https://www.youtube.com/watch?v={video_id}"
  outdir = Path(outdir)
  outdir.mkdir(exist_ok=True)

  cmd = [
    "yt-dlp",
    "--skip-download",                # don’t download video
    "--write-thumbnail",              # get thumbnail
    "--write-auto-subs",              # get auto subtitles
    "--sub-lang", "en",               # English subs
    "--convert-subs", "srt",          # convert to SRT
    "-o", str(outdir / f"{video_id}"),# output pattern
    url
  ]

  subprocess.run(cmd, check=False)

  # Paths
  thumb_path = next(outdir.glob(f"{video_id}*.jpg"), None)
  sub_path   = next(outdir.glob(f"{video_id}*.en.srt"), None)

  return str(thumb_path) if thumb_path else None, str(sub_path) if sub_path else None
"""
--- End Video & Audio Extraction ---
"""

def get_growth_targets(snapshots, horizons):
  if not snapshots or len(snapshots) < 2:
    return {}

  snapshots = sorted(snapshots, key=lambda x: x["timestamp"])
  start = snapshots[0]
  growth = {}

  for h in horizons:
    # Convert timestamp string to datetime and add hours
    start_time = pd.to_datetime(start["timestamp"])
    target_time = start_time + pd.Timedelta(hours=h)

    # find the closest snapshot after horizon
    later = next((s for s in snapshots if pd.to_datetime(s["timestamp"]) >= target_time), None)
    if later:
      growth[f"growth_likes_{h}h"] = later.get("likeCount", 0) - start.get("likeCount", 0)
      growth[f"growth_views_{h}h"] = later.get("viewCount", 0) - start.get("viewCount", 0)
      growth[f"growth_comments_{h}h"] = later.get("commentCount", 0) - start.get("commentCount", 0)
    else:
      # if no later snapshot, fill with None
      growth[f"growth_likes_{h}h"] = None
      growth[f"growth_views_{h}h"] = None
      growth[f"growth_comments_{h}h"] = None

  return growth

def prepare_growth_dataset(videos, horizons):
  X_data, y_data = [], []

  for v in videos:
    snapshots = v.get("snapshots", [])
    growth = get_growth_targets(snapshots, horizons)

    if growth:
      # here we can also add first-snapshot features as predictors
      first = snapshots[0]
      features = {
        "likes_start": first.get("likeCount", 0),
        "views_start": first.get("viewCount", 0),
        "comments_start": first.get("commentCount", 0),
        "followers_start": first.get("followerCount", 0),
      }
      X_data.append(features)
      y_data.append(growth)

  X = pd.DataFrame(X_data)
  y = pd.DataFrame(y_data).dropna()  # drop rows with missing horizons

  return X, y

def train_growth_model(videos, horizons=[24, 7*24, 30*24, 90*24]):
  """
  Train model to predict viewCount, likeCount, & commentCount
  after X period of time based on snapshots
  """
  X, y = prepare_growth_dataset(videos, horizons)

  # Check if we have enough data
  if len(X) == 0 or len(y) == 0:
    print("⚠️  No valid growth data found. Skipping growth model training.")
    return

  # Ensure alignment and numeric types
  X = X.select_dtypes(include=[np.number])
  y = y.select_dtypes(include=[np.number])

  if len(X) < 2:
    print(f"⚠️  Only {len(X)} samples available for growth model. Need at least 10. Skipping training.")
    return

  print(f"📊 Training growth model with {len(X)} samples and {X.shape[1]} features")

  # Load existing model if exist
  init_model = get_model_from_storage("vlc_growth_model")
  if init_model is not None:
    print(f"🔄 Continuing training for vlc_growth_model...")
    model = init_model
  else:
    print("🆕 Training from scratch...")
    base_model = SGDRegressor(
      max_iter=1000,
      tol=1e-3,
      penalty="l2",
      random_state=42
    )
    model = MultiOutputRegressor(base_model)

  # Incremental update
  if hasattr(model, "estimators_"):
    # already trained model → update each estimator
    for est, target in zip(model.estimators_, range(y.shape[1])):
      est.partial_fit(X, y.iloc[:, target])
  else:
    # brand new model → fit once
    model.partial_fit(X, y)

  # Evaluate (optional, needs hold-out split or rolling evaluation)
  y_pred = model.predict(X)
  for idx, col in enumerate(y.columns):
    mse = mean_squared_error(y.iloc[:, idx], y_pred[:, idx])
    print(f"{col}: MSE={mse:.2f}")

  # Save model
  upload_model_to_storage(model, "vlc_growth_model")

# Prepare numeric features
df["published_at"] = pd.to_datetime(
  df["metadata"].apply(lambda x: x.get("snippet", {}).get("publishedAt", None)),
  utc=True, errors="coerce"
)
df["platform_id"] = df["platform"].apply(get_platform_id)
df["category_id"] = df["metadata"].apply(lambda x: int(x.get("snippet", {}).get("categoryId", 0)))
df["like_count"] = df["metadata"].apply(lambda x: int(x.get("statistics", {}).get("likeCount", 0)))
df["view_count"] = df["metadata"].apply(lambda x: int(x.get("statistics", {}).get("viewCount", 0)))
df["comment_count"] = df["metadata"].apply(lambda x: int(x.get("statistics", {}).get("commentCount", 0)))
df["follower_count"] = df["metadata"].apply(lambda x: int(x.get("statistics", {}).get("followerCount", 0)))
df["upload_day_of_week"] = df["published_at"].dt.dayofweek
df["upload_hour"] = df["published_at"].dt.hour
df["upload_month"] = df["published_at"].dt.month
df["channel_view_count"] = df["metadata"].apply(lambda x: int(x.get("channel", {}).get("viewCount", 0)))
df["channel_video_count"] = df["metadata"].apply(lambda x: int(x.get("channel", {}).get("videoCount", 0)))
df["views_per_follower"] = df["view_count"] / df["follower_count"].replace(0, 1)
df["likes_per_view"] = df["like_count"] / df["view_count"].replace(0, 1)
df["comments_per_view"] = df["comment_count"] / df["view_count"].replace(0, 1)

projection_days = 180
df["projected_views_per_follower_6months"] = df["views_per_follower"] * 1.2
df["expected_views_6months"] = df["follower_count"] * df["projected_views_per_follower_6months"] * projection_days / 365
df["expected_likes_6months"] = df["expected_views_6months"] * df["likes_per_view"]
df["expected_comments_6months"] = df["expected_views_6months"] * df["comments_per_view"]
df["engagement_score"] = 0.4 * df["likes_per_view"] + 0.6 * df["comments_per_view"]

# 6) Text feature (for title/desc embeddings)
def prepare_text_features(row):
  # Title
  parts = [row.get("title", "")]

  # Tags (array -> string)
  if isinstance(row.get("tags"), list):
    parts.append(" ".join(row["tags"]))

  # Metadata.snippet.description
  snippet = row.get("metadata", {}).get("snippet", {})
  if snippet and "description" in snippet:
    parts.append(snippet["description"])

df["text_feature"] = df.apply(prepare_text_features, axis=1)
text_embeddings = model.encode(df["text_feature"].fillna(""), convert_to_numpy=True)

# 7) Comment sentiment (store ratios in df)
def extract_comment_sentiment(comments):
  if not comments: return (0.0, 0.0, 0.0)
  texts = [c.get("text", "") for c in comments if c.get("text", "").strip()]
  if not texts: return (0.0, 0.0, 0.0)
  # batch inference so it's not too slow
  batch = 64
  pos = neg = neu = 0
  total = 0
  for i in range(0, len(texts), batch):
    results = sentiment_pipeline(texts[i:i+batch], truncation=True)
    for r in results:
      label = r["label"].upper()
      if "POSITIVE" in label: pos += 1
      elif "NEGATIVE" in label: neg += 1
      else: neu += 1
    total += len(results)
  if total == 0: return (0.0, 0.0, 0.0)
  return (pos/total, neg/total, neu/total)

def get_weighted_comment_embedding(comments):
  if not comments: return None
  texts, weights = [], []
  for c in comments:
    t = c.get("text", "").strip()
    if t:
      texts.append(t)
      weights.append(max(1, c.get("likeCount", 0)))
  if not texts: return None
  vecs = model.encode(texts, convert_to_numpy=True, normalize_embeddings=False)
  return np.average(vecs, axis=0, weights=weights)

# Prepare embedding features
comment_embeds = []
comment_sents = []
thumbnail_embeddings = []
subtitle_embeddings = []

for _, row in df.iterrows():
  comments = row.get("top_comments", [])
  comment_embeds.append(get_weighted_comment_embedding(comments))
  comment_sents.append(extract_comment_sentiment(comments))

  video_id = row.get("video_id")
  thumb_path, sub_path = fetch_video_assets(video_id)
  thumb_emb = extract_thumbnail_embedding(thumb_path)
  sub_emb   = extract_subtitle_embedding(sub_path)

  # fallbacks
  if thumb_emb is None:
    thumb_emb = np.zeros(512)   # CLIP embedding dim
  if sub_emb is None:
    sub_emb = np.zeros(384)     # SBERT embedding dim

  thumbnail_embeddings.append(thumb_emb)
  subtitle_embeddings.append(sub_emb)

# Add sentiment features to DataFrame
df[["comment_sent_pos","comment_sent_neg","comment_sent_neu"]] = pd.DataFrame(
  comment_sents, index=df.index
)

# Build embeddings
comment_embeddings = np.vstack([
  e if e is not None else np.zeros(model.get_sentence_embedding_dimension())
  for e in comment_embeds
])
thumbnail_embeddings = np.vstack(thumbnail_embeddings)
subtitle_embeddings = np.vstack(subtitle_embeddings)

# Apply PCA reduction
pca_text = PCA(n_components=50, random_state=42)
pca_comm = PCA(n_components=50, random_state=42)
pca_thumb = PCA(n_components=50, random_state=42)
pca_sub = PCA(n_components=50, random_state=42)

text_reduced = pca_text.fit_transform(text_embeddings)
comment_reduced = pca_comm.fit_transform(comment_embeddings)
thumb_reduced = pca_thumb.fit_transform(thumbnail_embeddings)
sub_reduced = pca_sub.fit_transform(subtitle_embeddings)

# L2-normalize embeddings
text_reduced = l2norm(text_reduced)
comment_reduced = l2norm(comment_reduced)
thumb_reduced = l2norm(thumb_reduced)
sub_reduced = l2norm(sub_reduced)

# Collect numeric columns
numeric_cols = [
  "platform_id", "category_id",
  "like_count","view_count","comment_count","follower_count",
  "upload_day_of_week","upload_hour","upload_month",
  "channel_view_count","channel_video_count",
  "views_per_follower","likes_per_view","comments_per_view",
  "projected_views_per_follower_6months",
  "expected_views_6months", "expected_likes_6months", "expected_comments_6months",
  "engagement_score",
  "comment_sent_pos","comment_sent_neg","comment_sent_neu",
]

# Log-transform skewed features
for c in ["like_count","view_count","comment_count","follower_count",
          "channel_view_count","channel_video_count"]:
  df[c] = np.log1p(df[c])

# Train models
def train_main_model():
  tasks = {
    "views_6months": np.log1p(df["expected_views_6months"].fillna(0).values),
    "likes_6months": np.log1p(df["expected_likes_6months"].fillna(0).values),
    "comments_6months": np.log1p(df["expected_comments_6months"].fillna(0).values),
    "engagement_score": df["engagement_score"].fillna(0).values
  }

  numeric_matrix = df[numeric_cols].fillna(0).to_numpy()
  X_embed = np.hstack([text_reduced, comment_reduced, thumb_reduced, sub_reduced])
  X_full = np.hstack([X_embed, numeric_matrix])

  for task_name, y in tasks.items():
    X_train, X_test, y_train, y_test = train_test_split(
      X_full, y, test_size=0.2, random_state=42
    )

    n_embed = X_embed.shape[1]
    scaler = StandardScaler()
    X_train_num = scaler.fit_transform(X_train[:, n_embed:])
    X_test_num = scaler.transform(X_test[:, n_embed:])

    X_train_final = np.hstack([X_train[:, :n_embed], X_train_num])
    X_test_final = np.hstack([X_test[:, :n_embed], X_test_num])

    init_model = get_model_from_storage(f"{task_name}_model")
    if init_model is not None:
      print(f"🔄 Continuing training for {task_name}...")

    model_lgb = lgb.LGBMRegressor(objective="regression", n_estimators=1000, verbosity=-1)
    early_stopping_callback = lgb.early_stopping(stopping_rounds=50)
    model_lgb.fit(
      X_train_final, y_train,
      eval_set=[(X_test_final, y_test)],
      eval_metric="rmse",
      callbacks=[early_stopping_callback],
      init_model=init_model
    )

    y_pred = model_lgb.predict(X_test_final, num_iteration=model_lgb.best_iteration_)
    rmse = mean_squared_error(y_test, y_pred)
    print(f"[{task_name}] RMSE: {rmse:.4f}")

    upload_model_to_storage(model_lgb, f"{task_name}_model")

train_main_model()

# Now train the growth model
# train_growth_model(df.to_dict('records'))

# Update database
video_ids = [item['id'] for item in response.data]
if video_ids:
  supabase.table("scraped_videos").update({"trained_with": 1}).in_("id", video_ids).execute()
print(f"✅ Total videos trained: {len(video_ids)}")
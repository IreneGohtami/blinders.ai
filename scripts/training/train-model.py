# train_model.py
import os
import pandas as pd
import lightgbm as lgb
from supabase import create_client, Client
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.linear_model import SGDRegressor
from sklearn.multioutput import MultiOutputRegressor
from sklearn.preprocessing import StandardScaler
from sentence_transformers import SentenceTransformer
import numpy as np
from dotenv import load_dotenv
import joblib
from pathlib import Path
from datetime import datetime, timezone
import io
#from openai import OpenAI

# Load .env.local from scripts/
_script_dir_env = Path(__file__).parent.parent / ".env.local"
load_dotenv(_script_dir_env)

# Connect to Supabase
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(url, key)

# Fetch dataset from your scraped table with pagination
page_size = 1000
page = 0

# Fetch data ordered by oldest ID first with pagination
response = supabase.table("scraped_videos").select("*").eq('trained_with', 0).range(page * page_size, (page + 1) * page_size - 1).execute()
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

  print(f"✅ Uploaded updated model for {model_name}.pkl to Supabase")


'''
openAIClient = OpenAI()
def get_weighted_comment_embedding(comments, model="text-embedding-3-small"):
  if not comments:
    return None

  # Extract texts and weights
  texts = []
  weights = []
  for c in comments:
    text = c.get("text", "").strip()
    if text:
      texts.append(text)
      weights.append(max(1, c.get("likeCount", 0)))  # ensure non-zero weight

  if not texts:
    return None

  # Get embeddings
  response = openAIClient.embeddings.create(
    model=model,
    input=texts
  )

  vectors = [np.array(item.embedding) for item in response.data]

  # Weighted average
  weighted_avg = np.average(vectors, axis=0, weights=weights)

  return weighted_avg
'''

# Can use: "all-MiniLM-L6-v2" (small, fast), or "BAAI/bge-small-en-v1.5" (newer, better)
model = SentenceTransformer("all-MiniLM-L6-v2")

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
      growth[f"growth_likes_{h}h"] = later["likeCount"] - start["likeCount"]
      growth[f"growth_views_{h}h"] = later["viewCount"] - start["viewCount"]
      growth[f"growth_comments_{h}h"] = later["commentCount"] - start["commentCount"]
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
        "likes_start": first["likeCount"],
        "views_start": first["viewCount"],
        "comments_start": first["commentCount"],
        "followers_start": first["followerCount"],
      }
      X_data.append(features)
      y_data.append(growth)

  X = pd.DataFrame(X_data)
  y = pd.DataFrame(y_data).dropna()  # drop rows with missing horizons

  return X, y

# Train model to predict viewCount, likeCount, & commentCount after X period of time based on snapshots
def train_growth_model(videos, horizons=[24, 7*24, 30*24, 90*24]):
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

  # Create or load models
  models_dir = Path(__file__).parent / "models"
  models_dir.mkdir(exist_ok=True)
  model_path = models_dir / "vlc_growth_model.pkl"

  # Load existing or create new incremental model
  if model_path.exists():
    print("🔄 Loading existing model for incremental training...")
    model = joblib.load(model_path)
  else:
    print("✨ Creating new incremental model...")
    base_model = SGDRegressor(
      max_iter=1000,
      tol=1e-3,
      penalty="l2",
      random_state=42
    )
    model = MultiOutputRegressor(base_model)

  # Incremental update
  model.partial_fit(X, y)

  # Evaluate (optional, needs hold-out split or rolling evaluation)
  y_pred = model.predict(X)
  for idx, col in enumerate(y.columns):
    mse = mean_squared_error(y.iloc[:, idx], y_pred[:, idx])
    print(f"{col}: MSE={mse:.2f}")

  # Save updated model
  joblib.dump(model, model_path)
  print("✅ Model saved: vlc_growth_model.pkl")


def get_weighted_comment_embedding(comments):
  if not comments:
    return None

  # Extract texts and weights
  texts = []
  weights = []
  for c in comments:
    text = c.get("text", "").strip()
    if text:
      texts.append(text)
      weights.append(max(1, c.get("likeCount", 0)))  # ensure non-zero weight

  if not texts:
    return None

  # Get embeddings (batch encode all texts at once)
  vectors = model.encode(texts, convert_to_numpy=True, normalize_embeddings=True)

  # Weighted average
  weighted_avg = np.average(vectors, axis=0, weights=weights)

  return weighted_avg

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

# --- Embeddings ---
#embed_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
text_embeddings = model.encode(df["text_feature"].fillna(""), convert_to_numpy=True)

numeric_features = []
embeddings = []

for _, row in df.iterrows():
  stats = row.get("metadata", {}).get("statistics", {})
  channel = row.get("metadata", {}).get("channel", {})
  snippet = row.get("metadata", {}).get("snippet", {})
  snapshots = row.get("snapshots", [])

  likes = int(stats.get("likeCount", 0))
  views = int(stats.get("viewCount", 0))
  comment_count = int(stats.get("commentCount", 0))
  favorites = int(stats.get("favoriteCount", 0))
  followers = int(stats.get("followerCount", 0))
  channel_video_count = int(channel.get("videoCount", 0))
  channel_view_count = int(channel.get("viewCount", 0))
  publish_hour = snippet.get("publishedAt", "").split("T")[1].split(":")[0]
  publish_day = snippet.get("publishedAt", "").split("T")[0].split("-")[2]
  category_id = int(snippet.get("categoryId", 0))

  top_comments = row.get("top_comments", [])
  avg_comment_likes = np.mean([c.get("likeCount", 0) for c in top_comments]) if top_comments else 0
  comment_embedding = get_weighted_comment_embedding(top_comments)

  like_rate = likes / views if views else 0
  comment_rate = comment_count / views if views else 0
  favorite_rate = favorites / views if views else 0
  engagement_per_follower = (likes + comment_count + favorites) / followers if followers else 0
  views_per_follower = views / followers if followers else 0
  likes_per_follower = likes / followers if followers else 0

  numeric_features.append([
    likes, views, favorites, followers,
    channel_video_count, channel_view_count, publish_hour, publish_day, category_id,
    avg_comment_likes, comment_count,
    like_rate, comment_rate, favorite_rate,
    engagement_per_follower, views_per_follower, likes_per_follower
  ])

  embedding_dim = model.get_sentence_embedding_dimension()
  embeddings.append(comment_embedding if comment_embedding is not None else np.zeros(embedding_dim))


numeric_data = np.array(numeric_features, dtype=float)
comment_embeddings = np.vstack(embeddings)   # shape: (n_samples, embedding_dim)

# Define column order to match the numeric_features list
column_order = [
  'likes', 'views', 'favorites', 'followers',
  'channel_video_count', 'channel_view_count', 'publish_hour', 'publish_day', 'category_id',
  'avg_comment_likes', 'comment_count',
  'like_rate', 'comment_rate', 'favorite_rate',
  'engagement_per_follower', 'views_per_follower', 'likes_per_follower'
]

# Create column index mapping
column_indices = {name: idx for idx, name in enumerate(column_order)}

# Numeric features with heavy skew
skewed = [
  'likes', 'views', 'favorites', 'followers',
  'channel_video_count', 'channel_view_count', 'comment_count'
]

# Apply log1p transformation using numeric indices
for item in skewed:
  if item in column_indices:
    numeric_data[:, column_indices[item]] = np.log1p(numeric_data[:, column_indices[item]])

# Scale numeric features (important so they’re not dwarfed by embeddings)
scaler = StandardScaler()
numeric_scaled = scaler.fit_transform(numeric_data)

def ensure_2d(arr):
  arr = np.array(arr)
  if arr.ndim == 1:   # single vector
    arr = arr.reshape(1, -1)
  return arr

text_embeddings = ensure_2d(text_embeddings)
comment_embeddings = ensure_2d(comment_embeddings)
numeric_scaled = ensure_2d(numeric_scaled)


X = np.hstack([text_embeddings, comment_embeddings, numeric_scaled])
print("Final X:", X.shape)


# Convert publishedAt → datetime
df["published_at"] = pd.to_datetime(
  df["metadata"].apply(lambda x: x.get("snippet", {}).get("publishedAt", None)),
  utc=True,
  errors="coerce"  # invalid/missing dates become NaT
)
df["like_count"] = df["metadata"].apply(lambda x: int(x.get("statistics", {}).get("likeCount", 0)))
df["view_count"] = df["metadata"].apply(lambda x: int(x.get("statistics", {}).get("viewCount", 0)))
df["comment_count"] = df["metadata"].apply(lambda x: int(x.get("statistics", {}).get("commentCount", 0)))

today = datetime.now(timezone.utc)

# Days since upload (avoid division by zero)
df["days_since_upload"] = (today - df["published_at"]).dt.days.clip(lower=1)

# Average daily views
print(df["days_since_upload"], df["view_count"], df["comment_count"])
df["avg_daily_views"] = df["view_count"] / df["days_since_upload"]

# Project to 6 months (≈ 180 days)
projection_days = 180

# Create follower-based features
df["follower_count"] = df["metadata"].apply(lambda x: x.get("statistics", {}).get("followerCount", 0))

# Engagement ratios (views per follower, likes/comments per view)
df["views_per_follower"] = df["view_count"] / df["follower_count"].replace(0, 1)  # avoid division by zero
df["likes_per_view"] = df["like_count"] / df["view_count"].replace(0, 1)
df["comments_per_view"] = df["comment_count"] / df["view_count"].replace(0, 1)

# Project views based on current engagement ratios and follower growth potential
df["projected_views_per_follower_6months"] = df["views_per_follower"] * 1.2  # Assume 20% follower growth
df["expected_total_views_6months"] = (
  df["follower_count"] * df["projected_views_per_follower_6months"] * projection_days / 365
)

# Project engagement metrics based on current ratios
df["expected_likes_6months"] = df["expected_total_views_6months"] * df["likes_per_view"]
df["expected_comments_6months"] = df["expected_total_views_6months"] * df["comments_per_view"]

# Overall engagement score (weighted combination)
df["engagement_score"] = (
  df["likes_per_view"] * 0.4 + df["comments_per_view"] * 0.6  # Comments are more valuable
)

print(df[[
  "like_count",
  "view_count",
  "comment_count",
  "follower_count",
  "days_since_upload",
  "views_per_follower",
  "likes_per_view",
  "comments_per_view",
  "expected_likes_6months",
  "expected_comments_6months",
  "expected_total_views_6months",
  "engagement_score"
]])

# Choose N - days after upload
N = 30

# Filter only videos that are at least N days old
df_trainable = df[df["days_since_upload"] >= N].copy()

# Ensure X and Y have the same rows
text_embeddings_filtered = text_embeddings[df_trainable.index]
comment_embeddings_filtered = comment_embeddings[df_trainable.index]
numeric_scaled_filtered = numeric_scaled[df_trainable.index]

X = np.hstack([
  text_embeddings_filtered,
  comment_embeddings_filtered,
  numeric_scaled_filtered
])

# Define meaningful targets using engagement ratios and follower count
df_trainable["target_views_6months"] = df_trainable["expected_total_views_6months"]
df_trainable["target_likes_6months"] = df_trainable["expected_likes_6months"]
df_trainable["target_comments_6months"] = df_trainable["expected_comments_6months"]
df_trainable["target_engagement_score"] = df_trainable["engagement_score"]

# List of prediction tasks (focus on most useful metrics)
tasks = {
  "views_6months": df_trainable["target_views_6months"].fillna(0).values,
  "likes_6months": df_trainable["target_likes_6months"].fillna(0).values,
  "comments_6months": df_trainable["target_comments_6months"].fillna(0).values,
  "engagement_score": df_trainable["target_engagement_score"].fillna(0).values
}

# Loop through each tas
for task_name, y_raw in tasks.items():
  # Log-transform (helps with skew)
  y = np.log1p(y_raw)

  # Train/test split
  X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
  )

  # Load existing model if incremental learning
  init_model = get_model_from_storage(f"{task_name}_model")
  if init_model is not None:
    print(f"🔄 Continuing training for {task_name}...")

  # Train LightGBM
  model = lgb.LGBMRegressor(objective="regression", n_estimators=1000, verbosity=-1)
  early_stopping_callback = lgb.early_stopping(stopping_rounds=50)
  model.fit(
    X_train, y_train,
    eval_set=[(X_test, y_test)],
    eval_metric="rmse",
    callbacks=[early_stopping_callback],
    init_model=init_model
  )

  # Evaluate (optional)
  y_pred = model.predict(X_test, num_iteration=model.best_iteration_)
  rmse = mean_squared_error(y_test, y_pred)
  print(f"[{task_name}] RMSE: {rmse:.4f}")

  # Upload model to Supabase storage
  upload_model_to_storage(model, f"{task_name}_model")


# Now train the growth model
train_growth_model(df_trainable.to_dict('records'))


# Finally, update database and flag the row
video_ids = [item['id'] for item in response.data]
if video_ids:
  supabase.table("scraped_videos").update({"trained_with": 1}).in_("id", video_ids).execute()
print("✅ Database updated")

'''
# Train/Test Split for 6-month views prediction
X_train, X_test, y_train_6m, y_test_6m = train_test_split(
  X, y_6month_views, test_size=0.2, random_state=42
)

# Train LightGBM Model for 6-month prediction
params = {
  "objective": "regression",
  "metric": ["mae", "rmse"],
  "boosting_type": "gbdt",
  "learning_rate": 0.05,
  "num_leaves": 31,
  "feature_fraction": 0.8,
  "bagging_fraction": 0.8,
  "bagging_freq": 5,
}

# Train 6-month views prediction model
dtrain_6m = lgb.Dataset(X_train, label=y_train_6m)
dvalid_6m = lgb.Dataset(X_test, label=y_test_6m, reference=dtrain_6m)
model_6month_views = lgb.train(params, dtrain_6m, valid_sets=[dvalid_6m], num_boost_round=500)  # early_stopping_round=20


# -----------------------
# 5. Evaluate 6-Month Views Prediction Model
# Lower MAE = Better accuracy
# Higher R2 = Better fit of model to data
# -----------------------

# Evaluate 6-Month Views Model
y_pred_6m = model_6month_views.predict(X_test)
mae_6m = mean_absolute_error(y_test_6m, y_pred_6m)
r2_6m = r2_score(y_test_6m, y_pred_6m)

print("=== 6-MONTH VIEWS PREDICTION MODEL ===")
print(f"MAE: {mae_6m:.2f}")
print(f"R²: {r2_6m:.2f}")

# Show feature importance for follower-based prediction
feature_importance = model_6month_views.feature_importance(importance_type='gain')
print(f"\nTop 10 Most Important Features:")
for i, importance in enumerate(feature_importance.argsort()[-10:][::-1]):
    print(f"Feature {importance}: {importance}")


# -----------------------
# 6. Save 6-Month Prediction Model
# -----------------------
models_dir = Path(__file__).parent / "models"
models_dir.mkdir(exist_ok=True)

# Save model with absolute path
model_6month_views.save_model(str(models_dir / "lightgbm_6month_views_prediction.txt"))
print(f"✅ 6-Month Views Prediction model saved to {models_dir / 'lightgbm_6month_views_prediction.txt'}")
'''

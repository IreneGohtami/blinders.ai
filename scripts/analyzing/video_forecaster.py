import io
import joblib
import numpy as np
import os
from sentence_transformers import SentenceTransformer
from supabase import create_client

class VideoForecaster:
    def __init__(self, supabase_url=None, supabase_key=None):
        self.supabase = create_client(
            supabase_url or os.environ.get("SUPABASE_URL"),
            supabase_key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        )
        self.text_model = SentenceTransformer("all-MiniLM-L6-v2")
        self.models = self._load_models()
        
    def _load_models(self):
        models = {}
        model_names = ["views_6months", "likes_6months", "comments_6months", "engagement_score"]
        
        for name in model_names:
            try:
                res = self.supabase.storage.from_("models").download(f"{name}_model.pkl")
                models[name] = joblib.load(io.BytesIO(res))
                print(f"✅ Loaded {name}_model.pkl from Supabase")
            except Exception as e:
                print(f"⚠️ Failed to load {name}_model.pkl: {e}")
        
        return models
    
    def predict(self, video_summary, metadata=None):
        """
        Predict 6-month forecast statistics from video analysis summary
        
        Args:
            video_summary: Text summary from analyze_video
            metadata: Optional dict with keys like follower_count, category_id, etc.
        
        Returns:
            dict with predicted views, likes, comments, engagement_score
        """
        if not self.models:
            raise ValueError("No models loaded. Train models first.")
        
        # Generate text embedding
        text_emb = self.text_model.encode(video_summary, convert_to_numpy=True)
        
        # Create feature vector (simplified - matches training structure)
        # In production, you'd want to match exact feature engineering from training
        features = self._build_features(text_emb, metadata or {})
        
        predictions = {}
        for name, model in self.models.items():
            pred = model.predict([features])[0]
            # Reverse log1p transformation
            predictions[name] = np.expm1(pred) if pred > 0 else 0
        
        return predictions
    
    def _build_features(self, text_emb, metadata):
        """Build feature vector matching training format"""
        # Pad/truncate text embedding to 50 dimensions
        text_reduced = text_emb[:50] if len(text_emb) > 50 else np.pad(text_emb, (0, 50-len(text_emb)))
        
        # Zero embeddings for comment, thumbnail, subtitle (50 each)
        comment_reduced = np.zeros(50)
        thumb_reduced = np.zeros(50)
        sub_reduced = np.zeros(50)
        
        # Combine all embeddings (200 features)
        X_embed = np.concatenate([text_reduced, comment_reduced, thumb_reduced, sub_reduced])
        
        # Numeric features (22 features) - match training order
        numeric_features = [
            metadata.get("platform_id", 1),
            metadata.get("category_id", 0),
            np.log1p(metadata.get("like_count", 0)),
            np.log1p(metadata.get("view_count", 0)),
            np.log1p(metadata.get("comment_count", 0)),
            np.log1p(metadata.get("follower_count", 1000)),
            metadata.get("upload_day_of_week", 3),
            metadata.get("upload_hour", 12),
            metadata.get("upload_month", 6),
            np.log1p(metadata.get("channel_view_count", 0)),
            np.log1p(metadata.get("channel_video_count", 0)),
            metadata.get("views_per_follower", 0),
            metadata.get("likes_per_view", 0),
            metadata.get("comments_per_view", 0),
            metadata.get("projected_views_per_follower_6months", 0),
            metadata.get("expected_views_6months", 0),
            metadata.get("expected_likes_6months", 0),
            metadata.get("expected_comments_6months", 0),
            metadata.get("engagement_score", 0),
            metadata.get("comment_sent_pos", 0),
            metadata.get("comment_sent_neg", 0),
            metadata.get("comment_sent_neu", 0),
        ]
        
        # Combine embeddings + numeric (222 features total)
        features = np.concatenate([X_embed, numeric_features])
        
        return features

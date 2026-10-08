-- Run this in your Supabase SQL editor to create the video_analyses table

-- Create video_analyses table
CREATE TABLE IF NOT EXISTS video_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  video_id TEXT NOT NULL,
  title TEXT,
  duration INTEGER,
  thumbnail_url TEXT,
  channel TEXT,
  view_count INTEGER,
  summary TEXT,
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_video_analyses_user_id ON video_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_video_analyses_status ON video_analyses(status);

-- Enable RLS
ALTER TABLE video_analyses ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own video analyses" ON video_analyses;
DROP POLICY IF EXISTS "Users can insert their own video analyses" ON video_analyses;
DROP POLICY IF EXISTS "Users can update their own video analyses" ON video_analyses;

-- Create RLS policies
CREATE POLICY "Users can view their own video analyses" ON video_analyses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own video analyses" ON video_analyses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own video analyses" ON video_analyses
  FOR UPDATE USING (auth.uid() = user_id);
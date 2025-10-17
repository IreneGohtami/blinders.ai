import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

export async function POST(request) {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Extract video ID from YouTube URL
    const videoId = extractVideoId(url)
    if (!videoId) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 })
    }

    // Create initial record
    const { data: videoRecord, error: insertError } = await supabase
      .from('video_analyses')
      .insert({
        user_id: user.id,
        video_url: url,
        video_id: videoId,
        status: 'processing'
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: 'Failed to create record' }, { status: 500 })
    }

    // Trigger analysis asynchronously
    processVideoAsync(videoRecord.id, url)

    return NextResponse.json({
      success: true,
      videoId: videoRecord.id,
      message: 'Video analysis started'
    })

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function extractVideoId(url) {
  const regex = /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([^&\n?#]+)/
  const match = url.match(regex)
  return match ? match[1] : null
}

async function processVideoAsync(recordId, url) {
  try {
    // Use Railway for production, local Python for development
    if (process.env.NODE_ENV === 'production' && process.env.RAILWAY_SERVICE_URL) {
      const response = await fetch(`${process.env.RAILWAY_SERVICE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, record_id: recordId })
      })
      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`)
      }
    } else {
      // Local development - spawn Python process
      const scriptPath = path.join(process.cwd(), 'scripts', 'analyzing', 'analyze_video_api.py')
      const pythonProcess = spawn('python', [scriptPath, url, recordId], {
        env: { ...process.env }
      })
      
      pythonProcess.stdout.on('data', (data) => {
        console.log(`Python output: ${data}`)
      })
      
      pythonProcess.stderr.on('data', (data) => {
        console.error(`Python error: ${data}`)
      })
      
      pythonProcess.on('close', (code) => {
        console.log(`Python process exited with code ${code}`)
      })
    }
  } catch (error) {
    console.error('Failed to process video:', error)

    // Update record with error status
    const supabase = await createClient()
    await supabase
      .from('video_analyses')
      .update({ status: 'failed', error_message: error.message })
      .eq('id', recordId)
  }
}
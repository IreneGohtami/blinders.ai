import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/account?error=oauth_cancelled`)
  }

  if (!code) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/account?error=no_code`)
  }

  try {
    // Extract user ID from state
    const userId = state?.split('userId=')[1]

    // Exchange code for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_AUTH_CLIENT_ID,
        client_secret: process.env.GOOGLE_AUTH_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback/youtube`
      })
    })

    const tokens = await tokenResponse.json()
    if (!tokens.access_token) {
      throw new Error('No access token received')
    }

    // Get YouTube channel info
    const channelResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true`,
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    )

    const channelData = await channelResponse.json()
    const channel = channelData.items?.[0]

    if (channel) {
      // Save to Supabase
      const supabase = await createClient()
      const { error: insertError } = await supabase
        .from('social_connections')
        .upsert({
          user_id: userId,
          platform: 'youtube',
          platform_user_id: channel.id,
          username: channel.snippet.title,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          profile_data: {
            subscriber_count: channel.statistics.subscriberCount,
            video_count: channel.statistics.videoCount,
            view_count: channel.statistics.viewCount,
            thumbnail: channel.snippet.thumbnails.default.url
          },
          connected_at: new Date().toISOString()
        })

      if (insertError) {
        console.error('Supabase insert error:', insertError)
        throw insertError
      }
    }

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/account?success=youtube_connected`)
  } catch (error) {
    console.error('YouTube OAuth error:', error)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/account?error=connection_failed`)
  }
}
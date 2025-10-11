'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import ToastNotification from '@/components/ToastNotification'

export default function AccountForm({ user }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [firstname, setFirstname] = useState(null)
  const [lastname, setLastname] = useState(null)
  const [email, setEmail] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState({ message: '', type: '', show: false })
  const [youtubeConnection, setYoutubeConnection] = useState(null)
  const [expandedYoutube, setExpandedYoutube] = useState(false)

  const showToast = (message, type = 'success') => {
    setToast({ message, type, show: true })
    setTimeout(() => setToast({ message: '', type: '', show: false }), 5000)
  }

  const uploadAvatar = async (event) => {
    try {
      setUploading(true)

      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('You must select an image to upload.')
      }

      const file = event.target.files[0]
      const fileExt = file.name.split('.').pop()
      const filePath = `${user.id}-${Math.random()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file)

      if (uploadError) {
        throw uploadError
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: data.publicUrl })
        .eq('id', user.id)

      if (updateError) {
        throw updateError
      }

      setAvatarUrl(data.publicUrl)
      showToast('Avatar updated successfully!')
    } catch (error) {
      showToast('Error uploading avatar. Please try again.', 'error')
    } finally {
      setUploading(false)
    }
  }

  const getProfile = useCallback(async () => {
    try {
      setLoading(true)

      const { data, error, status } = await supabase
        .from('profiles')
        .select(`first_name, last_name, email, avatar_url`)
        .eq('id', user?.id)
        .single()

      if (error && status !== 406) {
        throw error
      }

      if (data) {
        setFirstname(data.first_name)
        setLastname(data.last_name)
        setEmail(data.email)
        setAvatarUrl(data.avatar_url)
      }

      // Fetch YouTube connection
      const { data: socialConnections, error: scError } = await supabase
        .from('social_connections')
        .select('platform, username, profile_data')
        .eq('user_id', user?.id)

      if (scError && scError.code !== 'PGRST116') {
        console.error('YouTube connection error:', scError)
      } else {
        setYoutubeConnection(socialConnections.find(conn => conn.platform === 'youtube') || null)
      }
    } catch (error) {
      showToast('Error loading user data. Please refresh the page.', 'error')
    } finally {
      setLoading(false)
    }
  }, [user, supabase])

  useEffect(() => {
    getProfile()

    // Check for OAuth callback messages
    const urlParams = new URLSearchParams(window.location.search)
    const success = urlParams.get('success')
    const error = urlParams.get('error')

    if (success === 'youtube_connected') {
      showToast('YouTube account connected successfully!')
      getProfile() // Refresh data to show updated connection status
      // Clean URL
      window.history.replaceState({}, '', '/account')
    } else if (error) {
      const errorMessages = {
        oauth_cancelled: 'YouTube connection was cancelled',
        no_code: 'YouTube connection failed - no authorization code',
        connection_failed: 'Failed to connect YouTube account'
      }
      showToast(errorMessages[error] || 'YouTube connection failed', 'error')
      // Clean URL
      window.history.replaceState({}, '', '/account')
    }
  }, [user, getProfile])

  async function updateProfile({ firstname, lastname }) {
    try {
      setLoading(true)

      if (!user || !user?.email) {
        showToast('Please login to continue.', 'error')
        return;
      }

      const { error } = await supabase
      .from('profiles')
      .update({
        email: user?.email,
        first_name: firstname,
        last_name: lastname,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user?.id);

      if (error) throw error
      showToast('Profile updated successfully!')
    } catch (error) {
      showToast('Error updating profile. Please try again.', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function connectToYouTube() {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_AUTH_CLIENT_ID;
    const redirect = encodeURIComponent(process.env.NEXT_PUBLIC_SITE_URL + '/auth/callback/youtube');
    const scope = encodeURIComponent('https://www.googleapis.com/auth/youtube.readonly');
    const state = encodeURIComponent('userId=' + user.id);
    const youtubeAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirect}&response_type=code&scope=${scope}&state=${state}&include_granted_scopes=true&access_type=offline&prompt=consent`;
    window.location.href = youtubeAuthUrl;
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <ToastNotification
            toast={toast}
            onDismiss={() => setToast({ message: '', type: '', show: false })}
          />

          {/* Header */}
          <div className="mb-8">
            <h1 className="page-title mb-0">Account Settings</h1>
            <p className="page-subtitle mt-1">Manage your account information and preferences</p>
          </div>

          {/* Profile Card */}
          <div className="card max-w-none">
            {/* Profile Picture Section */}
            <div className="flex items-center space-x-6 pb-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex-shrink-0">
                <div className="profile-avatar">
                  {avatarUrl ? (
                    <img className="h-20 w-20 rounded-full object-cover" src={avatarUrl} alt="Profile" />
                  ) : (
                    <svg className="h-10 w-10 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                  )}
                </div>
              </div>
              <div className="flex-1">
                <h3>
                  {firstname && lastname ? `${firstname} ${lastname}` : 'Complete your profile'}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
                <input
                  type="file"
                  id="avatar-upload"
                  accept="image/*"
                  onChange={uploadAvatar}
                  disabled={uploading}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => document.getElementById('avatar-upload').click()}
                  disabled={uploading}
                  className="mt-2 text-sm link"
                >
                  {uploading ? 'Uploading...' : 'Change photo'}
                </button>
              </div>
            </div>

            {/* Profile Form */}
            <div className="pt-6">
              <h3 className="mb-6">Personal Information</h3>

              <div className="form-group">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="firstName" className="form-label">First name</label>
                    <input
                      id="firstName"
                      type="text"
                      className="form-input"
                      value={firstname || ''}
                      onChange={(e) => setFirstname(e.target.value)}
                      placeholder="Enter your first name"
                    />
                  </div>

                  <div>
                    <label htmlFor="lastName" className="form-label">Last name</label>
                    <input
                      id="lastName"
                      type="text"
                      className="form-input"
                      value={lastname || ''}
                      onChange={(e) => setLastname(e.target.value)}
                      placeholder="Enter your last name"
                    />
                  </div>
                </div>

                {/*<div>
                  <label htmlFor="email" className="form-label">Email address</label>
                  <input
                    id="email"
                    type="email"
                    className="form-input bg-gray-50 dark:bg-gray-600 cursor-not-allowed"
                    value={user?.email || ''}
                    disabled
                    placeholder="your@email.com"
                  />
                  <p className="mt-1 text-xs">Email cannot be changed</p>
                </div>*/}

                <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => updateProfile({ firstname, lastname })}
                    disabled={loading}
                  >
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Social Media Connections */}
          <div className="card max-w-none mt-8">
            <div className="pb-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Social Media Connections</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Connect your social media accounts to sync your content and analytics</p>
            </div>

            <div className="pt-6 space-y-4">
              {/* YouTube */}
              <div className="border border-gray-200 dark:border-gray-600 rounded-lg">
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">YouTube</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Connect to sync your channel analytics</p>
                    </div>
                  </div>
                  {youtubeConnection ? (
                    <button
                      type="button"
                      onClick={() => setExpandedYoutube(!expandedYoutube)}
                      className="btn-connected"
                    >
                      Connected
                      <svg className={`ml-2 h-4 w-4 transition-transform ${expandedYoutube ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={connectToYouTube}
                      className="btn-connect"
                    >
                      Connect
                    </button>
                  )}
                </div>

                {/* Expandable YouTube Summary */}
                {expandedYoutube && youtubeConnection && (
                  <div className="border-t border-gray-200 dark:border-gray-600 p-4 bg-gray-50 dark:bg-gray-800/50">
                    <div className="flex items-start space-x-4">
                      <img
                        src={youtubeConnection.profile_data?.thumbnail}
                        alt="Channel thumbnail"
                        className="w-16 h-16 rounded-full object-cover"
                      />
                      <div className="flex-1">
                        <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-2">{youtubeConnection.username}</h5>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500 dark:text-gray-400">Subscribers</p>
                            <p className="font-medium text-gray-900 dark:text-gray-100">{parseInt(youtubeConnection.profile_data?.subscriber_count || 0).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 dark:text-gray-400">Videos</p>
                            <p className="font-medium text-gray-900 dark:text-gray-100">{parseInt(youtubeConnection.profile_data?.video_count || 0).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 dark:text-gray-400">Total Views</p>
                            <p className="font-medium text-gray-900 dark:text-gray-100">{parseInt(youtubeConnection.profile_data?.view_count || 0).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Instagram */}
              <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Instagram</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Connect to sync your posts and insights</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => showToast('Instagram connection coming soon!', 'success')}
                  className="btn-connect"
                >
                  Connect
                </button>
              </div>

              {/* TikTok */}
              <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-black dark:bg-gray-800 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-.88-.05A6.33 6.33 0 0 0 5.76 20.5a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.8-.5z"/>
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">TikTok</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Connect to sync your videos and analytics</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => showToast('TikTok connection coming soon!', 'success')}
                  className="btn-connect"
                >
                  Connect
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import Sidebar from '@/components/Sidebar'
import ToastNotification from '@/components/ToastNotification'

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUploadVideoModal, setShowUploadVideoModal] = useState(false)
  const [uploadUrl, setUploadUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [showAnalysisModal, setShowAnalysisModal] = useState(false)
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' })
  const supabase = createClient()

  useEffect(() => {
    getUser()
    fetchVideos()
  }, [])

  // Poll for updates when there are processing videos
  useEffect(() => {
    const hasProcessingVideos = videos.some(v => v.status === 'processing')
    if (!hasProcessingVideos) return

    const interval = setInterval(() => {
      fetchVideos()
    }, 5000) // Poll every 5 seconds

    return () => clearInterval(interval)
  }, [videos])

  const getUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
  }

  const fetchVideos = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('video_analyses')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        //.limit(6)

      if (error) throw error
      setVideos(data || [])
    } catch (error) {
      console.error('Error fetching videos:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async () => {
    if (!uploadUrl.trim()) return

    setUploading(true)
    try {
      const response = await fetch('/api/analyze-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: uploadUrl })
      })

      if (response.ok) {
        setShowUploadVideoModal(false)
        setUploadUrl('')
        setToast({ show: true, message: 'Hang tight while we process your video...', type: 'success' })
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 6000)
        await fetchVideos()
      }
    } catch (error) {
      console.error('Upload error:', error)
    } finally {
        setUploading(false)
    }
  }

  const getProcessingStatus = () => {
    const processingVideo = videos.find(v => v.status === 'processing')
    if (!processingVideo) {
      const lastVideo = videos[0]
      if (!lastVideo) return 'No videos analyzed yet'

      if (lastVideo.completed_at && lastVideo.created_at) {
        const createdAt = new Date(lastVideo.created_at)
        const completedAt = new Date(lastVideo.completed_at)
        const durationMs = completedAt - createdAt
        const minutes = Math.floor(durationMs / 60000)
        const seconds = Math.floor((durationMs % 60000) / 1000)
        return `${lastVideo.title || 'Untitled Video'} - ${minutes}:${seconds.toString().padStart(2, '0')} total duration`
      }

      return lastVideo.summary ? lastVideo.summary.substring(0, 100) + '...' : 'No analysis available'
    }

    const createdAt = new Date(processingVideo.created_at)
    const now = new Date()
    const elapsedMs = now - createdAt
    const elapsedMinutes = Math.floor(elapsedMs / 60000)
    const elapsedSeconds = Math.floor((elapsedMs % 60000) / 1000)

    return `${processingVideo.title || 'Untitled Video'} - ${elapsedMinutes}:${elapsedSeconds.toString().padStart(2, '0')}`
  }

  const stats = {
    totalVideos: videos.length,
    avgLength: videos.length > 0 ? Math.round(videos.reduce((acc, v) => acc + (Math.floor((v.duration || 0) / 60)), 0) / videos.length) : 0
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <div className="w-64 flex-shrink-0">
        <Sidebar user={user} />
      </div>

      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">AI-powered video analysis insights</p>
              </div>
              <button
                onClick={() => setShowUploadVideoModal(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span>Upload Video</span>
              </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Videos</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">{stats.totalVideos}</p>
                  </div>
                  <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Avg Length</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">{stats.avgLength}m</p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Processing</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">{videos.filter(v => v.status === 'processing').length}</p>
                  </div>
                  <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Latest Summary */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-8">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Latest Analysis Summary</h3>
              <div className="space-y-3">
                {videos.slice(0, 3).map((video, index) => {
                  const createdAt = new Date(video.created_at)
                  const completedAt = video.completed_at ? new Date(video.completed_at) : new Date()
                  const durationMs = completedAt - createdAt
                  const minutes = Math.floor(durationMs / 60000)
                  const seconds = Math.floor((durationMs % 60000) / 1000)

                  return (
                    <div key={video.id} className="border-b border-gray-100 dark:border-gray-700 last:border-b-0 pb-2 last:pb-0">
                      <p className="text-gray-900 dark:text-gray-100 font-medium truncate">{video.title || 'Untitled Video'}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {video.status === 'processing' ? `Processing: ${minutes}:${seconds.toString().padStart(2, '0')}` :
                         video.completed_at ? `Completed: ${completedAt.toLocaleString()} • Time elapsed: ${minutes}min ${seconds.toString().padStart(2, '0')}sec` :
                         video.status === 'failed' ? `Failed` :
                         'Analysis pending'}
                      </p>
                    </div>
                  )
                })}
                {videos.length === 0 && (
                  <p className="text-gray-600 dark:text-gray-400">No videos analyzed yet</p>
                )}
              </div>
            </div>

            {/* My Videos Section */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">My Videos</h3>
              </div>

              <div className="p-6">
                {loading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1,2,3].map(i => (
                      <div key={i} className="animate-pulse">
                        <div className="aspect-video bg-gray-200 dark:bg-gray-700 rounded-lg mb-3"></div>
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
                      </div>
                    ))}
                  </div>
                ) : videos.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {videos.map((video) => (
                      <div key={video.id} className="group">
                        <div className="cursor-pointer" onClick={() => {
                          if (video.status !== 'processing' && (video.summary || video.error_message)) {
                            setSelectedVideo(video)
                            setShowAnalysisModal(true)
                          } else {
                            window.open(video.video_url, '_blank')
                          }
                        }}>
                        <div className="aspect-video bg-gray-100 dark:bg-gray-700 rounded-lg mb-3 overflow-hidden">
                          {video.thumbnail_url ? (
                            <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <svg className="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                        </div>
                          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1 line-clamp-2 truncate">{video.title || 'Untitled Video'}</h4>
                          <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              video.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                              video.status === 'processing' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                              'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                            }`}>
                              {video.status || 'Unknown'}
                            </span>
                            <span>{video.duration ? `${Math.floor(video.duration / 60)}m` : ''}</span>
                          </div>
                        </div>
                        {video.status === 'completed' && video.summary && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedVideo(video)
                              setShowAnalysisModal(true)
                            }}
                            className="mt-2 w-full bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                            View Analysis
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No videos yet</h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">Upload your first video to get AI-powered insights</p>
                    <button
                      onClick={() => setShowUploadVideoModal(true)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                      Upload Video
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Analysis Modal */}
      {showAnalysisModal && selectedVideo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{selectedVideo.title}</h3>
              <button
                onClick={() => setShowAnalysisModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              {/* Video Info */}
              <div className="flex items-center space-x-4">
                {selectedVideo.thumbnail_url && (
                  <img src={selectedVideo.thumbnail_url} alt={selectedVideo.title} className="w-24 h-16 object-cover rounded" />
                )}
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Duration: {selectedVideo.duration ? `${Math.floor(selectedVideo.duration / 60)}m` : 'Unknown'}</p>
                  <a href={selectedVideo.video_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline text-sm">
                    View on YouTube
                  </a>
                </div>
              </div>

              {/* Analysis Summary */}
              <div>
                <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Analysis Summary</h4>
                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{selectedVideo.summary || selectedVideo.error_message}</p>
                </div>
              </div>

              {/* Performance Forecast Placeholder */}
              <div>
                <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Performance Forecast</h4>
                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg text-center">
                  <p className="text-gray-500 dark:text-gray-400 italic">Performance forecasting will be available soon</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadVideoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Upload Video for Analysis</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Video URL</label>
              <input
                type="url"
                value={uploadUrl}
                onChange={(e) => setUploadUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowUploadVideoModal(false)}
                className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || !uploadUrl.trim()}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
              >
                {uploading ? 'Processing...' : 'Analyze'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastNotification
        toast={toast}
        onDismiss={() => setToast({ show: false, message: '', type: 'success' })}
      />
    </div>
  )
}

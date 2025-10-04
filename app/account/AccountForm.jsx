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
    } catch (error) {
      showToast('Error loading user data. Please refresh the page.', 'error')
    } finally {
      setLoading(false)
    }
  }, [user, supabase])

  useEffect(() => {
    getProfile()
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

                <div>
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
                </div>

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
        </div>
      </div>
    </div>
  )
}
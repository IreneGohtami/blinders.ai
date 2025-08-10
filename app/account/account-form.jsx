'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

export default function AccountForm({ user }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [firstname, setFirstname] = useState(null)
  const [lastname, setLastname] = useState(null)
  const [email, setEmail] = useState(null)

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
      }
    } catch (error) {
      alert('Error loading user data!')
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
        alert('Please login.')
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
      alert('Profile updated!')
    } catch (error) {
      alert('Error updating the data!')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form action="/auth/signout" method="post" className="space-y-4">
      <h2 className="text-base/7 font-semibold text-gray-900">Profile</h2>

      <div className="mt-6 max-w-md grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="col-span-2">
          <label htmlFor="email">Email</label>
          <div className="mt-2">
              <input id="email" type="email" onChange={(e) => setEmail(e.target.value)} placeholder="janedoe@gmail.com" value={user?.email} disabled />
          </div>
        </div>

        <div>
          <label htmlFor="firstName">First name</label>
          <div className="mt-2">
            <input id="firstName" type="text" value={firstname || ''} onChange={(e) => setFirstname(e.target.value)} />
          </div>
        </div>

        <div>
          <label htmlFor="lastName">Last name</label>
          <div className="mt-2">
            <input id="lastName" type="text" value={lastname || ''} onChange={(e) => setLastname(e.target.value)} />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-start gap-x-4">
          <button type="submit" className="btn-secondary">Sign out</button>
          <button type="button" className="btn-primary" onClick={() => updateProfile({ firstname, lastname })} disabled={loading}>{loading ? 'Loading ...' : 'Update'}</button>
        </div>
      </div>
    </form>
  )
}
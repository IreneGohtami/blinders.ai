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
    <form action="/auth/signout" method="post">
      <div className="space-y-12">
        <h2 className="text-base/7 font-semibold text-gray-900">Profile</h2>

        <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-4">
          <div className="sm:col-span-4">
            <label htmlFor="email" className="block text-sm/6 font-medium text-gray-900">Email</label>
            <div className="mt-2">
              <div className="flex items-center rounded-md bg-white pl-3 outline-1 -outline-offset-1 outline-gray-300 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600">
                <input id="email" type="email" onChange={(e) => setEmail(e.target.value)} placeholder="janedoe@gmail.com" className="block min-w-0 grow bg-white py-1.5 pr-3 pl-1 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none sm:text-sm/6" value={user?.email} disabled />
              </div>
            </div>
          </div>

            <div className="sm:col-span-2">
              <label htmlFor="firstName" className="block text-sm/6 font-medium text-gray-900">First name</label>
              <div className="mt-2">
                <input id="firstName" type="text" value={firstname || ''} onChange={(e) => setFirstname(e.target.value)} className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6" />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="lastName" className="block text-sm/6 font-medium text-gray-900">Last name</label>
              <div className="mt-2">
                <input id="lastName" type="text" value={lastname || ''} onChange={(e) => setLastname(e.target.value)} className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6" />
              </div>
            </div>

          <div className="mt-6 flex items-center justify-start gap-x-4">
            <button type="submit" className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">Sign out</button>
            <button type="button" onClick={() => updateProfile({ firstname, lastname })} disabled={loading} className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">{loading ? 'Loading ...' : 'Update'}</button>
          </div>
        </div>
      </div>
    </form>
  )
}
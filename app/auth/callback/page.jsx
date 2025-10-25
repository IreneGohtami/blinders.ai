'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

export default function AuthCallback() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const finishAuth = async () => {
      await supabase.auth.getSession() // forces code exchange
      router.replace('/dashboard')
    }
    finishAuth()
  }, [router, supabase])

  return (
    <div className="page-container">
      <div className="card text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="text-lg font-medium text-gray-700 dark:text-gray-300">Signing you in...</p>
        </div>
      </div>
    </div>
  )
}

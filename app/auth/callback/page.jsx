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
      router.replace('/account')
    }
    finishAuth()
  }, [router, supabase])

  return <p>Signing you in...</p>
}

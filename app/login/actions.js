'use server'

import { createClient } from '@/utils/supabase/server'

export async function login(formData) {
  const supabase = await createClient()

  const data = {
    email: formData.get('email'),
    password: formData.get('password'),
  }

  const { error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    return { error: error.message }
  }

  return { redirectUrl: '/account' }
}

export async function signup(formData) {
  const supabase = await createClient()

  const data = {
    email: formData.get('email'),
    password: formData.get('password'),
  }

  const { error } = await supabase.auth.signUp(data)

  if (error) {
    return { error: error.message }
  }

  return {
    signupConfirmationEmailSent: true,
    message: 'An email confirmation has been sent! Please verify your email to complete sign up.'
  }
}

export async function googleLogin() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
    },
  })

  if (error) {
    return { error: error.message }
  }

  if (data.url) {
    return { redirectUrl: data.url }
  }
}
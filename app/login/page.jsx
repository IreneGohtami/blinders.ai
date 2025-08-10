'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { login, signup, googleLogin } from './actions'

export default function LoginPage() {
  const router = useRouter()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
  const [modalMessage, setModalMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (formData, action) => {
    setIsLoading(true)
    setModalTitle('')
    setModalMessage('')

    try {
      const result = await action(formData)
      if (result.error) {
        setModalTitle('Error')
        setModalMessage(result.error)
        setIsModalOpen(true)
      }
      if (result.signupConfirmationEmailSent) {
        setModalTitle('Success')
        setModalMessage(result.message)
        setIsModalOpen(true)
      }
      if (result.redirectUrl) {
        router.push(result.redirectUrl)
      }
    } catch (error) {
      setModalTitle('Error')
      setModalMessage(error.message || 'An unexpected error occurred')
      setIsModalOpen(true)
    } finally {
      setIsLoading(false)
    }
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setModalMessage('')
    setModalTitle('')
  }

  return (
    <>
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-full max-w-sm bg-gray-100 p-6 rounded-lg">
          <form className="space-y-4">
            <div>
              <label htmlFor="email">Email</label>
              <div className="mt-2">
                <div className="flex items-center">
                  <input id="email" type="email" name="email" required />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="password">Password</label>
              <div className="mt-2">
                <div className="flex items-center">
                  <input id="password" type="password" name="password" required />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-start gap-x-4">
              <button
                type="button"
                disabled={isLoading}
                onClick={(e) => {
                  e.preventDefault()
                  const formData = new FormData(e.target.closest('form'))
                  handleSubmit(formData, login)
                }}
                className="btn-primary w-full"
              >
                Log in
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={(e) => {
                  e.preventDefault()
                  const formData = new FormData(e.target.closest('form'))
                  handleSubmit(formData, signup)
                }}
                className="btn-primary w-full"
              >
                Sign up
              </button>
            </div>

            <div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  const formData = new FormData(e.target.closest('form'))
                  handleSubmit(formData, googleLogin)
                }}
                className="px-4 py-2 border flex justify-center gap-2 border-slate-200 rounded-lg text-slate-700 hover:border-white hover:text-slate-900 hover:bg-white transition duration-150 w-full"
                loading="lazy"
              >
                <img className="w-6 h-6" src="images/google.svg" loading="lazy" alt="google logo"></img>
                <span>Sign in with Google</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-300 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{modalTitle}</h3>
            </div>
            <p className="text-gray-700 mb-6">{modalMessage}</p>
            <div className="flex justify-end">
              <button
                onClick={closeModal}
                className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
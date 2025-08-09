'use client'

import { useState } from 'react'
import { login, signup } from './actions'

export default function LoginPage() {
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
      <form>
        <div className="space-y-12">
          <div className="border-b border-white/10 pb-12">
            <h2 className="text-base/7 font-semibold text-gray-900">Login</h2>

            <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              <div className="sm:col-span-4">
                <label htmlFor="email" className="block text-sm/6 font-medium text-gray-900">Email</label>
                <div className="mt-2">
                  <div className="flex items-center">
                    <input id="email" type="email" name="email" required className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6" />
                  </div>
                </div>
              </div>

              <div className="sm:col-span-4">
                <label htmlFor="password" className="block text-sm/6 font-medium text-gray-900">Password</label>
                <div className="mt-2">
                  <div className="flex items-center">
                    <input id="password" type="password" name="password" required className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6" />
                  </div>
                </div>
              </div>
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
            className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Sign up
          </button>
        </div>
      </form>

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
'use client'
import { Toast } from 'flowbite-react'

export default function ToastNotification({ toast, onDismiss }) {
  if (!toast.show) return null

  return (
    <div className="fixed top-4 right-4 z-50 animate-slide-in">
      <Toast className={`p-2 ${
        toast.type === 'error' ? 'bg-red-500' :
        toast.type === 'success' ? 'bg-green-500' :
        'bg-yellow-500'
      }`}>
        <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center">
          <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-1 mr-2 text-sm font-normal text-white">{toast.message}</div>
        <button
          type="button"
          onClick={onDismiss}
          className="mr-2 ml-1 items-center justify-center bg-white text-gray-400 hover:text-gray-900 rounded-lg focus:ring-2 focus:ring-gray-300 p-1.5 hover:bg-gray-100 inline-flex h-8 w-8"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 14 14">
            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
          </svg>
        </button>
      </Toast>
    </div>
  )
}
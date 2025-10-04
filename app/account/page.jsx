import AccountForm from './AccountForm'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/components/Sidebar'

export default async function Account() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar user={user} />
      <div className="flex-1 overflow-auto">
        <AccountForm user={user} />
      </div>
    </div>
  )
}
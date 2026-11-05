import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'

export default async function HomePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role === 'CEO') redirect('/admin')
  if (user.role === 'MANAGER') redirect('/manager')
  if (user.role === 'KITCHEN') redirect('/kitchen')
  redirect('/login')
}

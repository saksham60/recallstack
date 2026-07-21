import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { isE2EAuthBypassEnabled } from '@/lib/config/server'

export async function proxy(request: NextRequest) {
  if (isE2EAuthBypassEnabled() && request.cookies.has('e2e-bypass-auth')) {
    return NextResponse.next({ request })
  }
  return await updateSession(request)
}

export default proxy

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

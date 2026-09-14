import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { isE2EAuthBypassEnabled } from '@/lib/config/server'

const PUBLIC_LIVE_CANVAS_PATH =
  /^\/system-design\/live\/[A-Za-z0-9_-]{20,128}\/?$/u

export async function proxy(request: NextRequest) {
  // Demo login validates its own same-origin POST before creating a session.
  if (request.nextUrl.pathname === '/api/auth/demo') {
    return NextResponse.next({ request })
  }
  // Both tutors authenticate in their handlers. Avoid duplicate auth/refresh
  // requests and always return API JSON, rather than a login-page redirect.
  if (['/api/reasonai/dsa/chat', '/api/reasonai/chat'].includes(request.nextUrl.pathname)) {
    return NextResponse.next({ request })
  }
  if (PUBLIC_LIVE_CANVAS_PATH.test(request.nextUrl.pathname)) {
    return NextResponse.next({ request })
  }
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

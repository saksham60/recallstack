import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const isE2E = process.env.E2E_BYPASS_AUTH === "1";
  if (isE2E && request.cookies.has('e2e-bypass-auth')) {
    return; // Bypass auth redirect
  }
  return await updateSession(request)
}

export default middleware

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

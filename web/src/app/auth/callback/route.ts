import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  
  // Validate "next" param for open-redirect prevention
  let next = requestUrl.searchParams.get('next') ?? '/dsa'
  // Only accept paths starting with a single slash (but not two slashes which would be protocol-relative)
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    next = '/dsa'
  }

  // Double-check URL construction to ensure same origin
  let redirectUrl: URL;
  try {
    redirectUrl = new URL(next, requestUrl.origin)
    if (redirectUrl.origin !== requestUrl.origin) {
      redirectUrl = new URL('/dsa', requestUrl.origin)
    }
  } catch {
    redirectUrl = new URL('/dsa', requestUrl.origin)
  }

  if (code) {
    if (process.env.E2E_BYPASS_AUTH === "1" && code === "mock") {
      return NextResponse.redirect(redirectUrl)
    }

    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(redirectUrl)
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(new URL('/login?error=auth-callback-failed', requestUrl.origin))
}

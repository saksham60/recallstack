import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isE2EAuthBypassEnabled } from '@/lib/config/server'
import {
  getSafeAuthRedirect,
  POST_AUTH_REDIRECT_COOKIE,
} from '@/features/auth/auth-redirect'

function clearPostAuthRedirect(response: NextResponse): NextResponse {
  response.cookies.set(POST_AUTH_REDIRECT_COOKIE, '', {
    maxAge: 0,
    path: '/',
  })
  return response
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  let cookieNext: string | undefined
  const encodedCookieNext = request.cookies.get(POST_AUTH_REDIRECT_COOKIE)?.value
  if (encodedCookieNext) {
    try {
      cookieNext = decodeURIComponent(encodedCookieNext)
    } catch {
      cookieNext = undefined
    }
  }

  const next = getSafeAuthRedirect(
    requestUrl.searchParams.get('next') ?? cookieNext,
  )

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
    if (isE2EAuthBypassEnabled() && code === "mock") {
      return clearPostAuthRedirect(NextResponse.redirect(redirectUrl))
    }

    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return clearPostAuthRedirect(NextResponse.redirect(redirectUrl))
    }
  }

  // return the user to an error page with instructions
  return clearPostAuthRedirect(
    NextResponse.redirect(
      new URL('/login?error=auth-callback-failed', requestUrl.origin),
    ),
  )
}

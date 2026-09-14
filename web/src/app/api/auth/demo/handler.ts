import "server-only";

interface DemoLoginOptions {
  enabled: boolean;
  email?: string;
  password?: string;
  signInWithPassword: (credentials: { email: string; password: string }) => Promise<{ error: unknown }>;
}

function redirect(request: Request, path: string) {
  return new Response(null, {
    status: 303,
    headers: {
      "Cache-Control": "no-store",
      Location: new URL(path, request.url).toString(),
    },
  });
}

export async function handleDemoLogin(request: Request, options: DemoLoginOptions): Promise<Response> {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  if (!options.enabled) return redirect(request, "/login?error=demo-disabled");
  if (!options.email || !options.password) return redirect(request, "/login?error=demo-auth-failed");

  try {
    const { error } = await options.signInWithPassword({
      email: options.email,
      password: options.password,
    });
    return error
      ? redirect(request, "/login?error=demo-auth-failed")
      : redirect(request, "/dsa");
  } catch {
    return redirect(request, "/login?error=demo-auth-failed");
  }
}

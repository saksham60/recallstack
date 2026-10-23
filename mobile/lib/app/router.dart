import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../core/auth/auth_repository.dart';
import '../features/identity/presentation/login_screen.dart';
import '../features/feed/presentation/feed_screen.dart';
import '../features/feed/presentation/story_detail_screen.dart';
import '../features/dsa/dsa_screens.dart';
import '../features/dsa/catalog_screen.dart';
import '../features/dsa/canonical_workspace.dart';
import '../features/revise/revise_screen.dart';
import '../features/library/presentation/library_screen.dart';
import '../features/profile/presentation/profile_screen.dart';
import '../shared/widgets/app_shell.dart';
import '../core/telemetry/product_telemetry.dart';

final _root = GlobalKey<NavigatorState>();
String? authRedirect(Session? session, Uri uri) {
  final path = uri.path;
  final from = uri.queryParameters['from'];
  if (session == null && path != '/login') {
    final target = path == '/splash' ? from ?? '/feed' : uri.toString();
    return '/login?from=${Uri.encodeComponent(target)}';
  }
  if (session != null && (path == '/login' || path == '/splash')) {
    final target = from == null ? null : Uri.tryParse(from);
    return target != null &&
            !target.hasScheme &&
            !target.hasAuthority &&
            target.path.startsWith('/') &&
            !['/login', '/splash'].contains(target.path)
        ? target.toString()
        : '/feed';
  }
  return null;
}

final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authRepositoryProvider);
  final router = GoRouter(
    navigatorKey: _root,
    initialLocation: '/splash',
    redirect: (_, state) => authRedirect(auth.current, state.uri),
    routes: [
      GoRoute(
        path: '/splash',
        builder: (_, _) =>
            const Scaffold(body: Center(child: CircularProgressIndicator())),
      ),
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) =>
            _AccountBoundary(child: AppShell(navigationShell: shell)),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/feed', builder: (_, _) => const FeedScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/dsa',
                builder: (_, _) => const DsaExplorerScreen(),
                routes: [
                  GoRoute(
                    path: 'categories/:categoryId',
                    builder: (_, s) => DsaProblemListScreen(
                      categoryId: s.pathParameters['categoryId']!,
                      name: s.uri.queryParameters['name'],
                    ),
                  ),
                  GoRoute(
                    path: 'problems/:slug',
                    builder: (_, s) => CanonicalWorkspace(
                      slug: s.pathParameters['slug']!,
                      version: s.uri.queryParameters['version'],
                    ),
                  ),
                  GoRoute(
                    path: 'study/:slug',
                    builder: (_, s) =>
                        DsaProblemScreen(slug: s.pathParameters['slug']!),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/revise', builder: (_, _) => const ReviseScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/library',
                builder: (_, _) => const LibraryScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/me', builder: (_, _) => const ProfileScreen()),
            ],
          ),
        ],
      ),
      GoRoute(
        parentNavigatorKey: _root,
        path: '/story/:storyId',
        builder: (_, s) => _AccountBoundary(
          child: StoryDetailScreen(storyId: s.pathParameters['storyId']!),
        ),
      ),
    ],
  );
  final subscription = auth.changes.listen(
    (_) => router.refresh(),
    onError: (Object error, StackTrace stackTrace) {
      // Do not log auth payloads, callback URLs, or session details.
      router.refresh();
    },
  );
  String? previousScreen;
  void recordScreen() {
    final path = router.routeInformationProvider.value.uri.path;
    final screen = path.startsWith('/dsa/problems/')
        ? 'problem'
        : path.startsWith('/dsa')
        ? 'dsa'
        : path.startsWith('/feed') || path.startsWith('/stories/')
        ? 'feed'
        : path.startsWith('/library')
        ? 'library'
        : path.startsWith('/revise')
        ? 'revise'
        : path.startsWith('/me')
        ? 'profile'
        : path.startsWith('/login')
        ? 'login'
        : 'other';
    if (previousScreen == screen) return;
    previousScreen = screen;
    final telemetry = ref.read(productTelemetryProvider);
    telemetry?.newJourney();
    telemetry?.track(
      TelemetryEvent.navigationScreenOpened,
      properties: {
        'screen': screen,
        'feature': screen == 'problem'
            ? 'dsa'
            : ['feed', 'dsa'].contains(screen)
            ? screen
            : 'other',
      },
    );
    if (screen == 'feed') telemetry?.track(TelemetryEvent.feedOpened);
    if (screen == 'dsa') telemetry?.track(TelemetryEvent.dsaExplorerOpened);
  }

  router.routeInformationProvider.addListener(recordScreen);
  ref.onDispose(() {
    router.routeInformationProvider.removeListener(recordScreen);
    subscription.cancel();
    router.dispose();
  });
  return router;
});

class _AccountBoundary extends ConsumerWidget {
  const _AccountBoundary({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context, WidgetRef ref) => KeyedSubtree(
    key: ValueKey(
      ref.watch(authStateProvider.select((state) => state.value?.user.id)),
    ),
    child: child,
  );
}

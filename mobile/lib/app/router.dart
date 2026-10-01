import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../core/auth/auth_repository.dart';
import '../features/identity/presentation/login_screen.dart';
import '../features/feed/presentation/feed_screen.dart';
import '../features/feed/presentation/story_detail_screen.dart';
import '../features/dsa/dsa_screens.dart';
import '../features/revise/revise_screen.dart';
import '../features/library/presentation/library_screen.dart';
import '../features/profile/presentation/profile_screen.dart';
import '../shared/widgets/app_shell.dart';

final _root = GlobalKey<NavigatorState>();
String? authRedirect(Session? session, Uri uri) {
  final path = uri.path;
  final from = uri.queryParameters['from'];
  if (session == null && path != '/login') {
    final target = path == '/splash' ? from ?? '/feed' : uri.toString();
    return '/login?from=${Uri.encodeComponent(target)}';
  }
  if (session != null && (path == '/login' || path == '/splash')) {
    return '/feed';
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
        builder: (_, _, shell) => AppShell(navigationShell: shell),
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
                builder: (_, _) => const DsaCategoriesScreen(),
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
        builder: (_, s) =>
            StoryDetailScreen(storyId: s.pathParameters['storyId']!),
      ),
    ],
  );
  final subscription = auth.changes.listen(
    (_) => router.refresh(),
    onError: (Object error, StackTrace stackTrace) {
      debugPrint('AUTH ERROR: $error\n$stackTrace');
      router.refresh();
    },
  );
  ref.onDispose(() {
    subscription.cancel();
    router.dispose();
  });
  return router;
});

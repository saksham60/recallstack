import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:app/core/auth/supabase_auth_repository.dart';

import 'package:app/features/identity/presentation/login_screen.dart';
import 'package:app/features/feed/presentation/feed_screen.dart';
import 'package:app/features/feed/presentation/story_detail_screen.dart';
import 'package:app/features/catalog/presentation/dsa_category_screen.dart';
import 'package:app/features/catalog/presentation/problem_list_screen.dart';
import 'package:app/features/learning/presentation/study_note_screen.dart';
import 'package:app/features/learning/presentation/revision_screen.dart';
import 'package:app/features/library/presentation/library_screen.dart';
import 'package:app/features/profile/presentation/profile_screen.dart';
import 'package:app/features/sync/presentation/conflict_resolution_screen.dart';
import 'package:app/shared/widgets/app_shell.dart';

part 'router.g.dart';

final GlobalKey<NavigatorState> _rootNavigatorKey =
    GlobalKey<NavigatorState>(debugLabel: 'root');
final GlobalKey<NavigatorState> _feedNavigatorKey =
    GlobalKey<NavigatorState>(debugLabel: 'feedNav');
final GlobalKey<NavigatorState> _dsaNavigatorKey =
    GlobalKey<NavigatorState>(debugLabel: 'dsaNav');
final GlobalKey<NavigatorState> _reviseNavigatorKey =
    GlobalKey<NavigatorState>(debugLabel: 'reviseNav');
final GlobalKey<NavigatorState> _libraryNavigatorKey =
    GlobalKey<NavigatorState>(debugLabel: 'libraryNav');
final GlobalKey<NavigatorState> _meNavigatorKey =
    GlobalKey<NavigatorState>(debugLabel: 'meNav');

@riverpod
GoRouter router(Ref ref) {
  final authState = ref.watch(authStateChangesProvider);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/feed',
    redirect: (context, state) {
      final isLoading = authState.isLoading;
      final session = authState.value?.session;

      final isGoingToLogin = state.uri.path == '/login';

      if (isLoading) return null;

      if (session == null && !isGoingToLogin) {
        return '/login';
      }

      if (session != null && isGoingToLogin) {
        return '/feed';
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return AppShell(navigationShell: navigationShell);
        },
        branches: [
          // Branch 0: Feed
          StatefulShellBranch(
            navigatorKey: _feedNavigatorKey,
            routes: [
              GoRoute(
                path: '/feed',
                builder: (context, state) => const FeedScreen(),
              ),
            ],
          ),
          // Branch 1: DSA
          StatefulShellBranch(
            navigatorKey: _dsaNavigatorKey,
            routes: [
              GoRoute(
                path: '/dsa',
                builder: (context, state) => const DSACategoryScreen(),
                routes: [
                  GoRoute(
                    path: 'categories/:categoryId',
                    builder: (context, state) => ProblemListScreen(
                      categoryId: state.pathParameters['categoryId']!,
                    ),
                  ),
                ],
              ),
            ],
          ),
          // Branch 2: Revise
          StatefulShellBranch(
            navigatorKey: _reviseNavigatorKey,
            routes: [
              GoRoute(
                path: '/revise',
                builder: (context, state) => const RevisionScreen(),
              ),
            ],
          ),
          // Branch 3: Library
          StatefulShellBranch(
            navigatorKey: _libraryNavigatorKey,
            routes: [
              GoRoute(
                path: '/library',
                builder: (context, state) => const LibraryScreen(),
              ),
            ],
          ),
          // Branch 4: Me
          StatefulShellBranch(
            navigatorKey: _meNavigatorKey,
            routes: [
              GoRoute(
                path: '/me',
                builder: (context, state) => const ProfileScreen(),
              ),
            ],
          ),
        ],
      ),
      // Full screen routes outside the shell
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: '/story/:storyId',
        builder: (context, state) =>
            StoryDetailScreen(storyId: state.pathParameters['storyId']!),
      ),
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: '/content/:slug',
        builder: (context, state) =>
            StudyNoteScreen(slug: state.pathParameters['slug']!),
      ),
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: '/conflicts',
        builder: (context, state) => const ConflictResolutionScreen(),
      ),
    ],
  );
}

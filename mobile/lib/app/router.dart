import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:app/core/auth/supabase_auth_repository.dart';

import 'package:app/features/identity/presentation/login_screen.dart';
import 'package:app/features/learning/presentation/home_screen.dart';
import 'package:app/features/catalog/presentation/dsa_category_screen.dart';
import 'package:app/features/catalog/presentation/problem_list_screen.dart';
import 'package:app/features/learning/presentation/study_note_screen.dart';
import 'package:app/features/learning/presentation/revision_screen.dart';
import 'package:app/features/sync/presentation/conflict_resolution_screen.dart';

part 'router.g.dart';

@riverpod
GoRouter router(Ref ref) {
  final authState = ref.watch(authStateChangesProvider);
  
  return GoRouter(
    initialLocation: '/home',
    redirect: (context, state) {
      // If authState is loading, we might want to show a splash screen, but for now:
      final isLoading = authState.isLoading;
      final session = authState.value?.session;
      
      final isGoingToLogin = state.uri.path == '/login';

      if (isLoading) return null; // wait for it

      if (session == null && !isGoingToLogin) {
        return '/login';
      }

      if (session != null && isGoingToLogin) {
        return '/home';
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/home',
        builder: (context, state) => const HomeScreen(),
      ),
      GoRoute(
        path: '/dsa',
        builder: (context, state) => const DSACategoryScreen(),
      ),
      GoRoute(
        path: '/categories/:categoryId',
        builder: (context, state) => ProblemListScreen(
          categoryId: state.pathParameters['categoryId']!,
        ),
      ),
      GoRoute(
        path: '/content/:slug',
        builder: (context, state) => StudyNoteScreen(
          slug: state.pathParameters['slug']!,
        ),
      ),
      GoRoute(
        path: '/revise',
        builder: (context, state) => const RevisionScreen(),
      ),
      GoRoute(
        path: '/profile',
        builder: (context, state) => const PlaceholderScreen(title: 'Profile'),
      ),
      GoRoute(
        path: '/conflicts',
        builder: (context, state) => const ConflictResolutionScreen(),
      ),
    ],
  );
}

// Temporary placeholder for screens
class PlaceholderScreen extends StatelessWidget {
  final String title;
  const PlaceholderScreen({super.key, required this.title});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(child: Text('Screen: $title')),
    );
  }
}

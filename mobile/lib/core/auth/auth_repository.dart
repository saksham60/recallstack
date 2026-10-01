import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class AuthRepository {
  AuthRepository(this.client);
  final SupabaseClient client;
  Future<bool>? _refreshing;
  Stream<AuthState> get changes => client.auth.onAuthStateChange;
  Session? get current => client.auth.currentSession;
  Future<void> signInWithGoogle() async {
    await client.auth.signInWithOAuth(
      OAuthProvider.google,
      redirectTo: 'com.recallstack.app://login-callback',
    );
  }

  Future<void> signInAsJudge() async {
    final response = await client.auth.signInAnonymously();
    if (response.session == null || response.user == null) {
      throw const AuthException('Anonymous sign-in did not create a session.');
    }
  }

  Future<void> signOut() async => client.auth.signOut();
  Future<bool> refreshSession() => _refreshing ??= _refresh().whenComplete(() {
    _refreshing = null;
  });
  Future<bool> _refresh() async {
    try {
      if (current == null) return false;
      final response = await client.auth.refreshSession();
      return response.session != null;
    } catch (_) {
      return false;
    }
  }
}

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(Supabase.instance.client),
);
final authStateProvider = StreamProvider<Session?>((ref) async* {
  final repository = ref.watch(authRepositoryProvider);
  yield repository.current;
  await for (final _ in repository.changes) {
    yield repository.current;
  }
});
final isJudgeSessionProvider = Provider<bool>(
  (ref) => ref.watch(authStateProvider).value?.user.isAnonymous == true,
);

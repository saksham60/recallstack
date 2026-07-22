import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'supabase_auth_repository.g.dart';

class SupabaseAuthRepository {
  final SupabaseClient _client;

  SupabaseAuthRepository(this._client);

  static Future<void> initialize() async {
    const dartDefineUrl = String.fromEnvironment('SUPABASE_URL');
    const dartDefineKey = String.fromEnvironment('SUPABASE_ANON_KEY');

    final supabaseUrl = dartDefineUrl.isNotEmpty ? dartDefineUrl : dotenv.env['SUPABASE_URL'];
    final supabaseAnonKey = dartDefineKey.isNotEmpty ? dartDefineKey : dotenv.env['SUPABASE_ANON_KEY'];

    if (supabaseUrl == null || supabaseAnonKey == null) {
      throw Exception('Missing Supabase configuration (check .env or --dart-define)');
    }

    await Supabase.initialize(
      url: supabaseUrl,
      publishableKey: supabaseAnonKey,
    );
  }

  Stream<AuthState> get authStateChanges => _client.auth.onAuthStateChange;

  User? get currentUser => _client.auth.currentUser;

  Future<void> signInWithGoogle() async {
    await _client.auth.signInWithOAuth(
      OAuthProvider.google,
      redirectTo: 'com.recallstack.app://login-callback',
    );
  }

  Future<void> signOut() async {
    await _client.auth.signOut();
  }

  Future<String?> getAccessToken() async {
    final session = _client.auth.currentSession;
    if (session == null || session.isExpired) {
      // Supabase auto-refreshes, but if it fails, it will be null.
      return null;
    }
    return session.accessToken;
  }
}

@riverpod
SupabaseAuthRepository authRepository(Ref ref) {
  return SupabaseAuthRepository(Supabase.instance.client);
}

@riverpod
Stream<AuthState> authStateChanges(Ref ref) {
  return ref.watch(authRepositoryProvider).authStateChanges;
}

@riverpod
User? currentUser(Ref ref) {
  final authState = ref.watch(authStateChangesProvider);
  return authState.value?.session?.user ?? ref.read(authRepositoryProvider).currentUser;
}

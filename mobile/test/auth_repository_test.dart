import 'package:app/core/auth/auth_repository.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _Client extends Mock implements SupabaseClient {}

class _Auth extends Mock implements GoTrueClient {}

void main() {
  late _Client client;
  late _Auth auth;
  late AuthRepository repository;

  setUp(() {
    client = _Client();
    auth = _Auth();
    when(() => client.auth).thenReturn(auth);
    repository = AuthRepository(client);
  });

  test(
    'Judge invokes Supabase anonymous sign-in and requires a session',
    () async {
      const user = User(
        id: 'judge',
        appMetadata: {},
        userMetadata: null,
        aud: 'authenticated',
        createdAt: '',
        isAnonymous: true,
      );
      final session = Session(
        accessToken: 'token',
        tokenType: 'bearer',
        user: user,
      );
      when(
        () => auth.signInAnonymously(),
      ).thenAnswer((_) async => AuthResponse(session: session));

      await repository.signInAsJudge();

      verify(() => auth.signInAnonymously()).called(1);
    },
  );

  test('Judge rejects a response without a Supabase session', () async {
    when(
      () => auth.signInAnonymously(),
    ).thenAnswer((_) async => AuthResponse());

    await expectLater(
      repository.signInAsJudge(),
      throwsA(isA<AuthException>()),
    );
  });

  test('Google OAuth uses the installed mobile callback', () async {
    when(
      () => auth.getOAuthSignInUrl(
        provider: OAuthProvider.google,
        redirectTo: 'com.recallstack.app://login-callback',
      ),
    ).thenThrow(const AuthException('URL request reached'));

    await expectLater(
      repository.signInWithGoogle(),
      throwsA(isA<AuthException>()),
    );

    verify(
      () => auth.getOAuthSignInUrl(
        provider: OAuthProvider.google,
        redirectTo: 'com.recallstack.app://login-callback',
      ),
    ).called(1);
  });
}

import 'dart:async';

import 'package:app/core/auth/auth_repository.dart';
import 'package:app/features/identity/presentation/login_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _PendingAuth extends AuthRepository {
  _PendingAuth()
    : super(
        SupabaseClient(
          'https://example.supabase.co',
          'anon',
          authOptions: const AuthClientOptions(autoRefreshToken: false),
        ),
      );

  final pending = Completer<void>();
  int googleCalls = 0;

  @override
  Future<void> signInWithGoogle() {
    googleCalls++;
    return pending.future;
  }

  @override
  Future<void> signInAsJudge() async {
    throw const AuthException('Anonymous login failed for test');
  }
}

void main() {
  setUp(() => dotenv.loadFromString(envString: 'HACKATHON_JUDGE_MODE=true'));

  testWidgets('sign-in buttons stay disabled during an auth request', (
    tester,
  ) async {
    final auth = _PendingAuth();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [authRepositoryProvider.overrideWithValue(auth)],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );

    await tester.tap(find.text('Continue with Google'));
    await tester.pump();

    expect(auth.googleCalls, 1);
    expect(
      tester
          .widget<FilledButton>(
            find.byWidgetPredicate((w) => w is FilledButton),
          )
          .onPressed,
      isNull,
    );
    expect(
      tester
          .widget<OutlinedButton>(
            find.byWidgetPredicate((w) => w is OutlinedButton),
          )
          .onPressed,
      isNull,
    );

    auth.pending.complete();
    await tester.pump();
  });

  testWidgets('Judge AuthException shows its real message', (tester) async {
    final auth = _PendingAuth();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [authRepositoryProvider.overrideWithValue(auth)],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );

    await tester.tap(find.text('Explore as Hackathon Judge'));
    await tester.pump();

    expect(find.text('Anonymous login failed for test'), findsOneWidget);
  });
}

import 'dart:async';
import 'package:app/app/app.dart';
import 'package:app/core/api/api_client.dart';
import 'package:app/core/api/api_failure.dart';
import 'package:app/core/auth/auth_repository.dart';
import 'package:app/core/db/app_database.dart';
import 'package:app/features/dsa/canonical_api.dart';
import 'package:app/features/dsa/python_editor.dart';
import 'package:app/shared/widgets/states.dart';
import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../test/support/canonical_fixture.dart';

// Device UI verification only. All auth and network responses are fixtures;
// this test never contacts production or launches a judge/AI operation.
class DeviceAuth extends AuthRepository {
  DeviceAuth()
    : super(
        SupabaseClient(
          'https://fixture.test',
          'public-fixture',
          authOptions: const AuthClientOptions(autoRefreshToken: false),
        ),
      );
  final events = StreamController<AuthState>.broadcast();
  Session? session;
  @override
  Session? get current => session;
  @override
  Stream<AuthState> get changes => events.stream;
  @override
  Future<void> signInWithGoogle() async {
    session = Session(
      accessToken: 'fixture-only-token',
      tokenType: 'bearer',
      user: const User(
        id: '60000000-0000-4000-8000-000000000001',
        appMetadata: {},
        userMetadata: {},
        aud: 'authenticated',
        createdAt: '',
      ),
    );
    events.add(AuthState(AuthChangeEvent.signedIn, session));
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'device workflow: login, edit, recover draft, Run, Submit, history, AI and navigation',
    (tester) async {
      dotenv.loadFromString(envString: 'HACKATHON_JUDGE_MODE=false');
      final auth = DeviceAuth();
      final db = AppDatabase.forTesting(NativeDatabase.memory());
      await db.writeRecord('device-preflight', 'sqlite-ready');
      final server = ContractServer(count: 375);
      final backend = Dio(BaseOptions(baseUrl: 'https://fixture.test/api/v1/'))
        ..httpClientAdapter = server;
      final web = Dio(BaseOptions(baseUrl: 'https://fixture.test/'))
        ..httpClientAdapter = server;
      addTearDown(() async {
        await auth.events.close();
        await auth.client.dispose();
        await db.close();
      });
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider.overrideWithValue(auth),
            appDatabaseProvider.overrideWithValue(db),
            backendDioProvider.overrideWithValue(backend),
            canonicalDsaApiProvider.overrideWithValue(
              CanonicalDsaApi(backend, web),
            ),
          ],
          child: const ReasonAIApp(),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue with Google'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('DSA').last);
      await tester.pumpAndSettle();
      expect(find.text('Array total'), findsOneWidget);
      await tester.tap(find.text('Array total'));
      await tester.pumpAndSettle();
      for (var i = 0; i < 100 && find.text('Editor').evaluate().isEmpty; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(
        find.text('Editor'),
        findsOneWidget,
        reason: tester
            .widgetList<ErrorState>(find.byType(ErrorState))
            .map(
              (w) => w.error is ApiFailure
                  ? (w.error as ApiFailure).cause
                  : w.error,
            )
            .join(' | '),
      );
      await tester.tap(find.text('Editor'));
      await tester.pumpAndSettle();
      final editor = find.descendant(
        of: find.byType(PythonEditor),
        matching: find.byType(TextField),
      );
      const source = 'def solve(nums):\n    return sum(nums)';
      await tester.enterText(editor, source);
      await tester.pump(const Duration(seconds: 1));
      expect(
        (await db.getDraft(
          'canonical:$problemId:$problemVersion:python',
        ))?.code,
        source,
      );
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Run'));
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 3));
      await tester.pumpAndSettle();
      expect(find.text('Public Run · completed'), findsOneWidget);
      await tester.tap(find.text('Submit'));
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 3));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open saved submission & AI review'));
      await tester.pumpAndSettle();
      expect(find.text('Fixture saved analysis'), findsOneWidget);
      await tester.tap(find.byTooltip('Close review'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Submissions & AI'));
      await tester.tap(find.text('Submissions & AI'));
      await tester.pumpAndSettle();
      expect(find.text('accepted'), findsOneWidget);
      expect(find.text('2026-10-19T00:00:00Z'), findsOneWidget);
      expect(server.launches, 2);
      await tester.pageBack();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Array total'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Editor'));
      await tester.pumpAndSettle();
      expect(tester.widget<TextField>(editor).controller?.text, source);
      await tester.pageBack();
      await tester.pumpAndSettle();
      for (final label in ['Library', 'Revise', 'Me', 'Feed']) {
        await tester.tap(find.text(label).last);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      }
      expect(find.text('Fixture learner'), findsNothing);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
    },
  );
}

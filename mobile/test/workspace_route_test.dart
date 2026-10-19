import 'package:app/core/db/app_database.dart';
import 'package:app/features/dsa/canonical_api.dart';
import 'package:app/features/dsa/canonical_workspace.dart';
import 'package:app/shared/widgets/states.dart';
import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'support/canonical_fixture.dart';

void main() {
  testWidgets(
    'canonical workspace loads its statement and editable draft through verified contracts',
    (tester) async {
      final db = AppDatabase.forTesting(NativeDatabase.memory());
      addTearDown(db.close);
      final server = ContractServer();
      final backend = Dio(BaseOptions(baseUrl: 'https://fixture.test/api/v1/'))
        ..httpClientAdapter = server;
      final web = Dio(BaseOptions(baseUrl: 'https://fixture.test/'))
        ..httpClientAdapter = server;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appDatabaseProvider.overrideWithValue(db),
            canonicalDsaApiProvider.overrideWithValue(
              CanonicalDsaApi(backend, web),
            ),
          ],
          child: const MaterialApp(
            home: CanonicalWorkspace(
              slug: problemSlug,
              version: problemVersion,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.byType(ErrorState),
        findsNothing,
        reason: tester
            .widgetList<ErrorState>(find.byType(ErrorState))
            .map((w) => w.error)
            .join(', '),
      );
      expect(find.text('Editor'), findsOneWidget);
      await tester.tap(find.text('Editor'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(TextField, 'Python solution'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );
}

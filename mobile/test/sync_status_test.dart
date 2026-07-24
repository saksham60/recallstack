import 'package:app/core/database/database.dart';
import 'package:app/core/sync/sync_status_provider.dart';
import 'package:app/shared/widgets/sync_status_badge.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _FixedSyncStatusNotifier extends SyncStatusNotifier {
  _FixedSyncStatusNotifier(this.initialState);

  final SyncState initialState;

  @override
  SyncState build() => initialState;
}

Widget _badgeWithStatus(SyncStatus status) {
  return ProviderScope(
    overrides: [
      syncStatusProvider.overrideWith(
        () => _FixedSyncStatusNotifier(SyncState(status: status)),
      ),
    ],
    child: const MaterialApp(home: Scaffold(body: SyncStatusBadge())),
  );
}

void main() {
  for (final testCase in <(SyncStatus, String)>[
    (SyncStatus.serverFailure, 'Server Error'),
    (SyncStatus.offline, 'Offline'),
    (SyncStatus.authenticationRequired, 'Login required'),
    (SyncStatus.partialFailure, 'Partial Sync Error'),
  ]) {
    testWidgets('${testCase.$1.name} has a distinct status badge', (
      tester,
    ) async {
      await tester.pumpWidget(_badgeWithStatus(testCase.$1));
      expect(find.text(testCase.$2), findsOneWidget);
      expect(find.text('Up to date'), findsNothing);
    });
  }

  for (final outboxStatus in ['rejected', 'conflict']) {
    testWidgets('$outboxStatus mutation produces syncIssue state', (
      tester,
    ) async {
      final db = AppDatabase(null);
      addTearDown(db.close);
      await db
          .into(db.localOutbox)
          .insert(
            LocalOutboxCompanion.insert(
              mutationId: 'mutation-$outboxStatus',
              mutationType: 'save_note',
              entityType: 'note',
              entityId: 'note-1',
              payloadJson: '{}',
              status: outboxStatus,
              createdAt: DateTime(2026),
            ),
          );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [appDatabaseProvider.overrideWithValue(db)],
          child: const MaterialApp(home: Scaffold(body: SyncStatusBadge())),
        ),
      );
      await tester.pump();

      expect(find.text('Sync Issue'), findsOneWidget);
    });
  }
}

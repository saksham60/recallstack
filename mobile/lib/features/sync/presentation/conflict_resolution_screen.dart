import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:drift/drift.dart' hide Column;
import 'package:app/core/database/database.dart';
import 'package:app/core/sync/sync_engine.dart';

class ConflictResolutionScreen extends ConsumerWidget {
  const ConflictResolutionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final db = ref.watch(appDatabaseProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Sync Conflicts')),
      body: StreamBuilder<List<LocalOutboxData>>(
        stream: (db.select(
          db.localOutbox,
        )..where((t) => t.status.equals('conflict'))).watch(),
        builder: (context, snapshot) {
          final conflicts = snapshot.data ?? [];
          if (conflicts.isEmpty) {
            return const Center(child: Text('No conflicts to resolve.'));
          }

          return ListView.builder(
            itemCount: conflicts.length,
            itemBuilder: (context, index) {
              final m = conflicts[index];
              return _buildConflictItem(context, ref, m, theme);
            },
          );
        },
      ),
    );
  }

  Widget _buildConflictItem(
    BuildContext context,
    WidgetRef ref,
    LocalOutboxData m,
    ThemeData theme,
  ) {
    String myVersion = 'Unknown';
    String serverVersion = 'Unknown';
    int serverRowVersion = 1;

    try {
      final payload = jsonDecode(m.payloadJson) as Map<String, dynamic>;
      myVersion = payload['note'] as String? ?? 'Unknown';

      if (m.lastError != null) {
        final errorData = jsonDecode(m.lastError!) as Map<String, dynamic>;
        serverVersion = errorData['server_note'] as String? ?? 'Unknown';
        serverRowVersion = errorData['server_row_version'] as int? ?? 1;
      }
    } catch (_) {}

    return Card(
      margin: const EdgeInsets.all(12),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.warning_amber, color: theme.colorScheme.error),
                const SizedBox(width: 8),
                Text('Note Conflict', style: theme.textTheme.titleMedium),
              ],
            ),
            const SizedBox(height: 16),
            const Text(
              'Your Version',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(8),
              color: theme.colorScheme.surfaceContainerHighest.withAlpha(50),
              child: Text(myVersion),
            ),
            const SizedBox(height: 16),
            const Text(
              'Server Version',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(8),
              color: theme.colorScheme.surfaceContainerHighest.withAlpha(50),
              child: Text(serverVersion),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => _resolveUseServer(ref, m),
                  child: const Text('Use Server Version'),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: () => _resolveKeepMine(ref, m, serverRowVersion),
                  child: const Text('Keep Mine'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _resolveUseServer(WidgetRef ref, LocalOutboxData m) async {
    final db = ref.read(appDatabaseProvider);
    // Delete the conflicting mutation, letting the next sync pull the authoritative server version
    await (db.delete(
      db.localOutbox,
    )..where((t) => t.mutationId.equals(m.mutationId))).go();
    ref.read(syncEngineProvider).runSync();
  }

  Future<void> _resolveKeepMine(
    WidgetRef ref,
    LocalOutboxData m,
    int newServerRowVersion,
  ) async {
    final db = ref.read(appDatabaseProvider);

    // Create a new valid mutation/update with latest row_version
    try {
      final payload = jsonDecode(m.payloadJson) as Map<String, dynamic>;
      payload['expected_row_version'] = newServerRowVersion;

      // Do not retry the stale conflicting mutation unchanged.
      // Mark it retryable with new payload
      await (db.update(
        db.localOutbox,
      )..where((t) => t.mutationId.equals(m.mutationId))).write(
        LocalOutboxCompanion(
          payloadJson: Value(jsonEncode(payload)),
          status: const Value('pending'),
          retryCount: const Value(0),
          nextRetryAt: const Value(null),
          lastError: const Value(null),
        ),
      );

      ref.read(syncEngineProvider).runSync();
    } catch (_) {}
  }
}

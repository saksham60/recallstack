import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:app/core/database/database.dart';

enum SyncStatus {
  idle,
  syncing,
  upToDate,
  pendingChanges,
  offline,
  authenticationRequired,
  partialFailure,
  serverFailure,
  syncIssue,
}

class SyncState {
  final SyncStatus status;
  final int pendingCount;
  final String? errorMessage;

  const SyncState({
    this.status = SyncStatus.idle,
    this.pendingCount = 0,
    this.errorMessage,
  });
}

class SyncStatusNotifier extends Notifier<SyncState> {
  @override
  SyncState build() {
    _listenToOutbox();
    return const SyncState();
  }

  void _listenToOutbox() {
    final db = ref.watch(appDatabaseProvider);
    db.select(db.localOutbox).watch().listen((mutations) {
      final pending = mutations
          .where(
            (m) =>
                m.status == 'pending' ||
                m.status == 'processing' ||
                m.status == 'retryable',
          )
          .length;
      final failed = mutations
          .where(
            (m) =>
                m.status == 'rejected' ||
                m.status == 'conflict' ||
                m.status == 'failed',
          )
          .length;

      if (failed > 0) {
        state = SyncState(status: SyncStatus.syncIssue, pendingCount: pending);
      } else if (pending > 0 &&
          state.status != SyncStatus.syncing &&
          state.status != SyncStatus.offline &&
          state.status != SyncStatus.serverFailure &&
          state.status != SyncStatus.partialFailure) {
        state = SyncState(
          status: SyncStatus.pendingChanges,
          pendingCount: pending,
        );
      } else if (pending == 0 && state.status == SyncStatus.pendingChanges) {
        state = const SyncState(status: SyncStatus.upToDate);
      }
    });
  }

  void setSyncing(bool isSyncing) {
    if (isSyncing) {
      state = SyncState(
        status: SyncStatus.syncing,
        pendingCount: state.pendingCount,
      );
    }
  }

  void setResult(SyncStatus resultStatus) {
    // Determine actual status based on outbox
    final db = ref.read(appDatabaseProvider);
    db.select(db.localOutbox).get().then((mutations) {
      final pending = mutations
          .where(
            (m) =>
                m.status == 'pending' ||
                m.status == 'processing' ||
                m.status == 'retryable',
          )
          .length;
      final failed = mutations
          .where(
            (m) =>
                m.status == 'rejected' ||
                m.status == 'conflict' ||
                m.status == 'failed',
          )
          .length;

      if (failed > 0) {
        state = SyncState(status: SyncStatus.syncIssue, pendingCount: pending);
      } else if (resultStatus == SyncStatus.upToDate && pending > 0) {
        state = SyncState(
          status: SyncStatus.pendingChanges,
          pendingCount: pending,
        );
      } else {
        state = SyncState(status: resultStatus, pendingCount: pending);
      }
    });
  }
}

final syncStatusProvider = NotifierProvider<SyncStatusNotifier, SyncState>(() {
  return SyncStatusNotifier();
});

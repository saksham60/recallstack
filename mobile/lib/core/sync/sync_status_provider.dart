import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:app/core/database/database.dart';

enum SyncStatus {
  offline,
  syncing,
  upToDate,
  pendingChanges,
  syncIssue,
}

class SyncState {
  final SyncStatus status;
  final int pendingCount;
  final String? errorMessage;

  const SyncState({
    this.status = SyncStatus.upToDate,
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
      final pending = mutations.where((m) => m.status == 'pending' || m.status == 'processing' || m.status == 'retryable').length;
      final failed = mutations.where((m) => m.status == 'rejected' || m.status == 'conflict').length;

      if (failed > 0) {
        state = SyncState(status: SyncStatus.syncIssue, pendingCount: pending);
      } else if (pending > 0) {
        state = SyncState(status: SyncStatus.pendingChanges, pendingCount: pending);
      } else {
        // If it was syncing, we should ideally coordinate with SyncEngine.
        // For simplicity, if there are no pending changes, it's either upToDate or Offline.
        if (state.status != SyncStatus.offline && state.status != SyncStatus.syncing) {
          state = const SyncState(status: SyncStatus.upToDate);
        }
      }
    });
  }

  void setSyncing(bool isSyncing) {
    if (isSyncing) {
      state = SyncState(status: SyncStatus.syncing, pendingCount: state.pendingCount);
    } else {
      // Re-evaluate based on outbox
      if (state.status == SyncStatus.syncing) {
         state = const SyncState(status: SyncStatus.upToDate); // Will be immediately overridden by outbox listener if pending exists
      }
    }
  }

  void setOffline() {
    state = SyncState(status: SyncStatus.offline, pendingCount: state.pendingCount);
  }
}

final syncStatusProvider = NotifierProvider<SyncStatusNotifier, SyncState>(() {
  return SyncStatusNotifier();
});

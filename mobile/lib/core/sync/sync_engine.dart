import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:drift/drift.dart' hide Column;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:app/core/api/api_client.dart';
import 'package:app/core/database/database.dart';
import 'package:app/core/sync/sync_status_provider.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';

class SyncEngine {
  final ApiClient _apiClient;
  final AppDatabase _db;
  final Ref _ref;
  bool _isSyncing = false;

  SyncEngine(this._apiClient, this._db, this._ref);

  Future<void> runSync() async {
    if (_isSyncing) return;
    _isSyncing = true;
    _ref.read(syncStatusProvider.notifier).setSyncing(true);
    try {
      await _recoverProcessingMutations();
      await _ensureDeviceRegistered();
      await _pushMutations();
      await _pullCatalogChanges('dsa'); // Assuming 'dsa' is the initial domain
      await _pullUserChanges();
    } on DioException {
      _ref.read(syncStatusProvider.notifier).setOffline();
    } catch (e, stack) {
      FirebaseCrashlytics.instance.recordError(e, stack, reason: 'runSync failed completely');
    } finally {
      _isSyncing = false;
      _ref.read(syncStatusProvider.notifier).setSyncing(false);
    }
  }

  Future<void> _recoverProcessingMutations() async {
    // If the app was killed while processing, move 'processing' back to 'pending'
    await (_db.update(_db.localOutbox)..where((t) => t.status.equals('processing')))
        .write(const LocalOutboxCompanion(status: Value('pending')));
  }

  Future<void> _ensureDeviceRegistered() async {
    final state = await (_db.select(_db.deviceState)..where((t) => t.id.equals('current'))).getSingleOrNull();
    if (state != null) {
      // Device is registered
      return;
    }

    try {
      final response = await _apiClient.client.post('/devices/register', data: {
        'device_name': 'Android Device',
        'platform': 'android',
        'app_version': '1.0.0',
      });
      final deviceId = response.data['id'] as String;
      
      await _db.into(_db.deviceState).insert(DeviceStateCompanion.insert(
        id: 'current',
        deviceId: deviceId,
        registeredAt: DateTime.now(),
      ));
    } catch (e, stack) {
      FirebaseCrashlytics.instance.recordError(e, stack, reason: 'Device registration failed');
      rethrow;
    }
  }

  Future<void> _pushMutations() async {
    final pendingMutations = await (_db.select(_db.localOutbox)
      ..where((t) => t.status.equals('pending') | t.status.equals('retryable'))
      ..where((t) => t.nextRetryAt.isNull() | t.nextRetryAt.isSmallerOrEqualValue(DateTime.now()))
    ).get();
    
    if (pendingMutations.isEmpty) return;

    // Mark as processing
    for (var m in pendingMutations) {
      await (_db.update(_db.localOutbox)..where((t) => t.mutationId.equals(m.mutationId)))
          .write(const LocalOutboxCompanion(status: Value('processing')));
    }

    final deviceState = await (_db.select(_db.deviceState)..where((t) => t.id.equals('current'))).getSingle();
    
    final payload = pendingMutations.map((m) => {
      'mutation_id': m.mutationId,
      'mutation_type': m.mutationType,
      'entity_type': m.entityType,
      'entity_id': m.entityId,
      'payload': jsonDecode(m.payloadJson),
    }).toList();

    try {
      final response = await _apiClient.client.post('/sync/mutations/batch', data: {
        'device_id': deviceState.deviceId,
        'mutations': payload,
      });

      final results = (response.data['results'] as List<dynamic>?)?.cast<Map<String, dynamic>>() ?? <Map<String, dynamic>>[];
      
      await _db.transaction(() async {
        for (final result in results) {
          final mId = result['mutation_id'] as String;
          final status = result['status'] as String; // 'applied', 'duplicate', 'rejected', 'conflict'
          final errorMessage = result['error_message'] as String?;

          if (status == 'applied' || status == 'duplicate') {
            await (_db.delete(_db.localOutbox)..where((t) => t.mutationId.equals(mId))).go();
          } else {
            // Permanent rejection or conflict
            await (_db.update(_db.localOutbox)..where((t) => t.mutationId.equals(mId)))
              .write(LocalOutboxCompanion(
                status: Value(status),
                lastError: Value(errorMessage),
              ));
          }
        }
      });
    } on DioException catch (e, stack) {
      FirebaseCrashlytics.instance.recordError(e, stack, reason: 'Sync mutations failed (network)');
      await _db.transaction(() async {
        for (var m in pendingMutations) {
          final nextRetry = m.retryCount + 1;
          final delaySeconds = (1 << (nextRetry > 12 ? 12 : nextRetry));
          
          await (_db.update(_db.localOutbox)..where((t) => t.mutationId.equals(m.mutationId)))
            .write(LocalOutboxCompanion(
              status: const Value('retryable'),
              retryCount: Value(nextRetry),
              nextRetryAt: Value(DateTime.now().add(Duration(seconds: delaySeconds))),
              lastError: Value(e.message),
            ));
        }
      });
    } catch (e, stack) {
      FirebaseCrashlytics.instance.recordError(e, stack, reason: 'Sync mutations failed (unexpected)');
      for (var m in pendingMutations) {
        await (_db.update(_db.localOutbox)..where((t) => t.mutationId.equals(m.mutationId)))
            .write(const LocalOutboxCompanion(status: Value('pending')));
      }
    }
  }

  Future<void> _pullCatalogChanges(String domainId) async {
    final cursorId = 'catalog_$domainId';
    final cursorRecord = await (_db.select(_db.syncCursors)..where((t) => t.id.equals(cursorId))).getSingleOrNull();
    final cursor = cursorRecord?.cursorValue ?? '';

    final deviceState = await (_db.select(_db.deviceState)..where((t) => t.id.equals('current'))).getSingleOrNull();
    if (deviceState == null) return;

    try {
      final response = await _apiClient.client.get('/sync/catalog/$domainId', queryParameters: {
        'device_id': deviceState.deviceId,
        if (cursor.isNotEmpty) 'after': cursor,
      });

      final data = response.data as Map<String, dynamic>;
      if (data['full_resync_required'] == true) {
        await _handleFullResync(domainId);
        return;
      }

      await _db.transaction(() async {
        final changes = data['changes'] as List<dynamic>? ?? [];
        
        // Apply catalog changes (Categories, ContentItems, ContentDocuments) safely inside transaction
        // ...

        // Update cursor ONLY AFTER applying changes
        final nextCursor = data['next_cursor'];
        if (nextCursor != null) {
          await _db.into(_db.syncCursors).insertOnConflictUpdate(SyncCursorsCompanion.insert(
            id: cursorId,
            cursorValue: nextCursor.toString(),
            updatedAt: DateTime.now(),
          ));
        }
      });
    } catch (e, stack) {
      FirebaseCrashlytics.instance.recordError(e, stack, reason: 'Failed pulling catalog changes');
    }
  }

  Future<void> _pullUserChanges() async {
    const cursorId = 'user';
    final cursorRecord = await (_db.select(_db.syncCursors)..where((t) => t.id.equals(cursorId))).getSingleOrNull();
    final cursor = cursorRecord?.cursorValue ?? '';

    final deviceState = await (_db.select(_db.deviceState)..where((t) => t.id.equals('current'))).getSingleOrNull();
    if (deviceState == null) return;

    try {
      final response = await _apiClient.client.get('/sync/user', queryParameters: {
        'device_id': deviceState.deviceId,
        if (cursor.isNotEmpty) 'after': cursor,
      });

      final data = response.data as Map<String, dynamic>;
      
      await _db.transaction(() async {
        final changes = data['changes'] as List<dynamic>? ?? [];

        // Apply user changes (Progress, Notes, Bookmarks, ReviewCards) safely inside transaction
        // ...

        // Update cursor
        final nextCursor = data['next_cursor'];
        if (nextCursor != null) {
          await _db.into(_db.syncCursors).insertOnConflictUpdate(SyncCursorsCompanion.insert(
            id: cursorId,
            cursorValue: nextCursor.toString(),
            updatedAt: DateTime.now(),
          ));
        }
      });
    } catch (e, stack) {
      FirebaseCrashlytics.instance.recordError(e, stack, reason: 'Failed pulling user changes');
    }
  }

  Future<void> _handleFullResync(String domainId) async {
    // 1. preserve unsynced outbox mutations (they live in localOutbox which we don't clear)
    // 2. clear relevant synchronized projections
    await _db.transaction(() async {
      // Clear catalog (cascade deletes documents if foreign keys are enabled, but let's be explicit)
      await _db.delete(_db.contentDocuments).go();
      await _db.delete(_db.contentItems).go();
      await _db.delete(_db.categories).go();

      // Clear cursors to force fresh pull
      await (_db.delete(_db.syncCursors)..where((t) => t.id.equals('catalog_$domainId'))).go();
      // Optionally user cursor too if domain resync affects user progress, but let's just clear catalog cursor.
    });

    // 3. fetch fresh state (this will naturally pull all catalog items again since cursor is gone)
    await _pullCatalogChanges(domainId);
  }
}

final syncEngineProvider = Provider<SyncEngine>((ref) {
  return SyncEngine(ref.watch(apiClientProvider), ref.watch(appDatabaseProvider), ref);
});


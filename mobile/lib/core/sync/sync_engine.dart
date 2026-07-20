import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:drift/drift.dart' hide Column;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:app/core/api/api_client.dart';
import 'package:app/core/database/database.dart';
import 'package:app/core/sync/sync_status_provider.dart';
import 'package:app/core/auth/supabase_auth_repository.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';

enum SyncResult { success, offline, authRequired, serverFailure, partialFailure }

class SyncEngine {
  final ApiClient _apiClient;
  final AppDatabase _db;
  final Ref _ref;
  bool _isSyncing = false;

  SyncEngine(this._apiClient, this._db, this._ref);

  Future<SyncResult> runSync() async {
    if (_isSyncing) return SyncResult.success;
    
    final user = _ref.read(currentUserProvider);
    if (user == null) return SyncResult.authRequired;

    _isSyncing = true;
    _ref.read(syncStatusProvider.notifier).setSyncing(true);
    
    try {
      await _recoverProcessingMutations();
      await _ensureDeviceRegistered();
      await _pushMutations();
      await _pullCatalogChanges('dsa'); // Assuming 'dsa' is the initial domain
      await _pullUserChanges();
      return SyncResult.success;
    } on DioException catch (e) {
      if (e.response?.statusCode == 401 || e.response?.statusCode == 403) {
        return SyncResult.authRequired;
      }
      _ref.read(syncStatusProvider.notifier).setOffline();
      return SyncResult.offline;
    } catch (e, stack) {
      FirebaseCrashlytics.instance.recordError(e, stack, reason: 'runSync failed completely');
      return SyncResult.serverFailure;
    } finally {
      _isSyncing = false;
      _ref.read(syncStatusProvider.notifier).setSyncing(false);
    }
  }

  Future<void> _recoverProcessingMutations() async {
    await (_db.update(_db.localOutbox)..where((t) => t.status.equals('processing')))
        .write(const LocalOutboxCompanion(status: Value('pending')));
  }

  Future<void> _ensureDeviceRegistered() async {
    final state = await (_db.select(_db.deviceState)..where((t) => t.id.equals('current'))).getSingleOrNull();
    if (state != null) return;

    try {
      final platformStr = Platform.isAndroid ? 'android' : Platform.isIOS ? 'ios' : 'web';
      final response = await _apiClient.client.post('/devices/register', data: {
        'device_name': 'RecallStack Mobile',
        'platform': platformStr,
        'app_version': '1.0.0', // In production, read from package_info_plus
      });
      final responseData = response.data as Map<String, dynamic>;
      final deviceId = responseData['id'] as String;
      
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

      final responseData = response.data as Map<String, dynamic>;
      final results = (responseData['results'] as List<dynamic>?)?.cast<Map<String, dynamic>>() ?? <Map<String, dynamic>>[];
      
      await _db.transaction(() async {
        for (final result in results) {
          final mId = result['mutation_id'] as String;
          final status = result['status'] as String; 
          final errorMessage = result['error_message'] as String?;

          if (status == 'applied' || status == 'duplicate') {
            await (_db.delete(_db.localOutbox)..where((t) => t.mutationId.equals(mId))).go();
          } else {
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

      final changes = data['changes'] as List<dynamic>? ?? [];
      final nextCursor = data['next_cursor'];
      
      bool hasUpserts = cursor.isEmpty; 
      List<String> deleteIds = [];

      for (final changeObj in changes) {
        final change = changeObj as Map<String, dynamic>;
        final op = change['operation'] as String;
        if (op == 'delete') {
          deleteIds.add(change['entity_id'] as String);
        } else {
          hasUpserts = true;
        }
      }

      await _db.transaction(() async {
        for (final id in deleteIds) {
          await (_db.delete(_db.contentDocuments)..where((t) => t.contentId.equals(id))).go();
          await (_db.delete(_db.contentItems)..where((t) => t.id.equals(id))).go();
          await (_db.delete(_db.categories)..where((t) => t.id.equals(id))).go();
        }

        if (hasUpserts) {
          final catRes = await _apiClient.client.get('/domains/$domainId/categories');
          final categories = catRes.data as List<dynamic>;
          for (final catObj in categories) {
            final cat = catObj as Map<String, dynamic>;
            await _db.into(_db.categories).insertOnConflictUpdate(CategoriesCompanion.insert(
              id: cat['id'],
              domainId: domainId,
              title: cat['name'],
              description: Value(cat['description']),
              sortOrder: cat['sort_order'],
              updatedAt: DateTime.now(),
            ));

            final contentRes = await _apiClient.client.get('/categories/${cat['id']}/content');
            final contentData = contentRes.data as Map<String, dynamic>;
            final items = contentData['items'] as List<dynamic>? ?? [];
            for (final itemObj in items) {
              final item = itemObj as Map<String, dynamic>;
              await _db.into(_db.contentItems).insertOnConflictUpdate(ContentItemsCompanion.insert(
                id: item['content_item_id'] ?? item['id'],
                categoryId: cat['id'],
                title: item['title'],
                slug: item['slug'],
                type: item['type'] ?? 'concept',
                difficulty: Value(item['difficulty']),
                sortOrder: item['sort_order'] ?? 0,
                updatedAt: DateTime.now(),
              ));
            }
          }
        }

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
      final changes = data['changes'] as List<dynamic>? ?? [];
      final nextCursor = data['next_cursor'];
      
      bool hasUpserts = cursor.isEmpty;
      List<String> deleteIds = [];

      for (final changeObj in changes) {
        final change = changeObj as Map<String, dynamic>;
        final op = change['operation'] as String;
        if (op == 'delete') {
          deleteIds.add(change['entity_id'] as String);
        } else {
          hasUpserts = true;
        }
      }

      await _db.transaction(() async {
        for (final id in deleteIds) {
          await (_db.delete(_db.userProgress)..where((t) => t.contentId.equals(id))).go();
          await (_db.delete(_db.bookmarks)..where((t) => t.contentId.equals(id))).go();
          await (_db.delete(_db.userNotes)..where((t) => t.id.equals(id))).go();
          await (_db.delete(_db.reviewCards)..where((t) => t.id.equals(id))).go();
        }

        if (hasUpserts) {
          // Fetch Progress
          final progRes = await _apiClient.client.get('/me/progress');
          final progResData = progRes.data as Map<String, dynamic>;
          final progData = progResData['items'] as List<dynamic>? ?? [];
          for (final pObj in progData) {
            final p = pObj as Map<String, dynamic>;
            await _db.into(_db.userProgress).insertOnConflictUpdate(UserProgressCompanion.insert(
              contentId: p['content_item_id'],
              status: p['status'],
              rowVersion: p['row_version'] ?? 0,
              updatedAt: DateTime.now(),
            ));
          }

          // Fetch Bookmarks
          final bmRes = await _apiClient.client.get('/me/bookmarks');
          final bmResData = bmRes.data as Map<String, dynamic>;
          final bmData = bmResData['items'] as List<dynamic>? ?? [];
          for (final bObj in bmData) {
            final b = bObj as Map<String, dynamic>;
            await _db.into(_db.bookmarks).insertOnConflictUpdate(BookmarksCompanion.insert(
              contentId: b['content_item_id'],
              createdAt: DateTime.now(),
            ));
          }

          // Fetch Notes
          final noteRes = await _apiClient.client.get('/me/notes');
          final noteResData = noteRes.data as Map<String, dynamic>;
          final noteData = noteResData['items'] as List<dynamic>? ?? [];
          for (final nObj in noteData) {
            final n = nObj as Map<String, dynamic>;
            await _db.into(_db.userNotes).insertOnConflictUpdate(UserNotesCompanion.insert(
              id: n['id'],
              contentId: n['content_item_id'],
              type: n['kind'] ?? 'note',
              body: n['body'] ?? '',
              rowVersion: n['row_version'] ?? 0,
              createdAt: DateTime.now(),
              updatedAt: DateTime.now(),
            ));
          }
        }

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
    await _db.transaction(() async {
      await _db.delete(_db.contentDocuments).go();
      await _db.delete(_db.contentItems).go();
      await _db.delete(_db.categories).go();

      await (_db.delete(_db.syncCursors)..where((t) => t.id.equals('catalog_$domainId'))).go();
    });

    await _pullCatalogChanges(domainId);
  }
}

final syncEngineProvider = Provider<SyncEngine>((ref) {
  return SyncEngine(ref.watch(apiClientProvider), ref.watch(appDatabaseProvider), ref);
});

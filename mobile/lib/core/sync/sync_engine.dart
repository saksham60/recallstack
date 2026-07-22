import 'dart:convert';
import 'dart:io';
import 'package:drift/drift.dart' hide Column;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:app/core/api/api_client.dart';
import 'package:app/core/api/api_error_handler.dart';
import 'package:app/core/database/database.dart';
import 'package:app/core/sync/sync_status_provider.dart';
import 'package:app/core/auth/supabase_auth_repository.dart';
import 'package:app/core/telemetry/app_logger.dart';

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
    
    bool hasPartialFailure = false;

    try {
      await _recoverProcessingMutations();
      await _ensureDeviceRegistered();
    } catch (e, stack) {
      final type = ApiErrorHandler.classify(e);
      if (type == SyncErrorType.authRequired) {
        _endSync();
        return SyncResult.authRequired;
      }
      if (type == SyncErrorType.offline) {
        _ref.read(syncStatusProvider.notifier).setOffline();
        _endSync();
        return SyncResult.offline;
      }
      AppLogger.recordError(e, stack, reason: 'Registration/Recovery failed');
      _endSync();
      return SyncResult.serverFailure;
    }

    try {
      await _pushMutations();
    } catch (e, stack) {
      AppLogger.recordError(e, stack, reason: 'Push mutations failed');
      hasPartialFailure = true;
    }

    try {
      await _pullCatalogChanges('dsa'); // Assuming 'dsa' is the initial domain
    } catch (e, stack) {
      AppLogger.recordError(e, stack, reason: 'Pull catalog changes failed');
      hasPartialFailure = true;
    }

    try {
      await _pullUserChanges();
    } catch (e, stack) {
      AppLogger.recordError(e, stack, reason: 'Pull user changes failed');
      hasPartialFailure = true;
    }

    _endSync();
    return hasPartialFailure ? SyncResult.partialFailure : SyncResult.success;
  }

  void _endSync() {
    _isSyncing = false;
    _ref.read(syncStatusProvider.notifier).setSyncing(false);
  }

  Future<void> _recoverProcessingMutations() async {
    await (_db.update(_db.localOutbox)..where((t) => t.status.equals('processing')))
        .write(const LocalOutboxCompanion(status: Value('pending')));
  }

  Future<void> _ensureDeviceRegistered() async {
    final state = await (_db.select(_db.deviceState)..where((t) => t.id.equals('current'))).getSingleOrNull();
    if (state != null) return;

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
      'entity_type': m.entityType,
      'entity_id': m.entityId,
      'operation': m.mutationType == 'delete_bookmark' ? 'delete' : (m.mutationType == 'insert_bookmark' ? 'insert' : (m.mutationType.contains('update') ? 'update' : 'insert')),
      'payload': jsonDecode(m.payloadJson),
    }).toList();

    // Fix operation mapping because mutationType historically held arbitrary strings.
    // We remap them cleanly based on entityType to adhere to backend.
    for (var p in payload) {
       final eType = p['entity_type'] as String;
       if (eType == 'practice_attempt' || eType == 'review') {
         p['operation'] = 'insert';
       } else if (eType == 'bookmark') {
         // Payload should dictate if it's insert or delete based on is_bookmarked
         final innerPayload = p['payload'] as Map<String, dynamic>;
         p['operation'] = innerPayload['is_bookmarked'] == true ? 'insert' : 'delete';
         // Bookmark must not send payload
         p['payload'] = {};
       } else if (eType == 'progress') {
         p['operation'] = 'update';
       } else if (eType == 'note') {
         p['operation'] = 'insert'; // Simplified for now
       }
    }

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
          final errorMessage = result['error_code'] as String?; // Backend sends error_code

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
    } catch (e) {
      final type = ApiErrorHandler.classify(e);
      if (type == SyncErrorType.authRequired) {
        rethrow;
      }

      if (type == SyncErrorType.permanentFailure || type == SyncErrorType.conflict) {
        await _db.transaction(() async {
          for (var m in pendingMutations) {
            await (_db.update(_db.localOutbox)..where((t) => t.mutationId.equals(m.mutationId)))
              .write(LocalOutboxCompanion(
                status: const Value('failed'),
                lastError: Value(e.toString()),
              ));
          }
        });
        return; // Processed as failed, continue sync
      }

      await _db.transaction(() async {
        for (var m in pendingMutations) {
          final nextRetry = m.retryCount + 1;
          final delaySeconds = (1 << (nextRetry > 12 ? 12 : nextRetry));
          
          await (_db.update(_db.localOutbox)..where((t) => t.mutationId.equals(m.mutationId)))
            .write(LocalOutboxCompanion(
              status: const Value('retryable'),
              retryCount: Value(nextRetry),
              nextRetryAt: Value(DateTime.now().add(Duration(seconds: delaySeconds))),
              lastError: Value(e.toString()),
            ));
        }
      });
      rethrow;
    }
  }

  Future<void> _pullCatalogChanges(String domainId) async {
    final cursorId = 'catalog_$domainId';
    final cursorRecord = await (_db.select(_db.syncCursors)..where((t) => t.id.equals(cursorId))).getSingleOrNull();
    String cursor = cursorRecord?.cursorValue ?? '';

    final deviceState = await (_db.select(_db.deviceState)..where((t) => t.id.equals('current'))).getSingleOrNull();
    if (deviceState == null) return;

    bool hasMoreChanges = true;
    bool hasUpserts = false;
    Map<String, List<String>> deletionsByType = {};

    while (hasMoreChanges) {
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
      
      for (final changeObj in changes) {
        final change = changeObj as Map<String, dynamic>;
        final op = change['operation'] as String;
        final entityType = change['entity_type'] as String;
        final entityId = change['entity_id'] as String;
        
        if (op == 'delete') {
          deletionsByType.putIfAbsent(entityType, () => []).add(entityId);
        } else {
          hasUpserts = true;
        }
      }
      
      cursor = data['next_cursor']?.toString() ?? cursor;
      hasMoreChanges = data['has_more'] == true;
    }

    // Process Deletions
    await _db.transaction(() async {
      for (final entry in deletionsByType.entries) {
        final type = entry.key;
        final ids = entry.value;
        if (type == 'content_document') {
          for (final id in ids) {
             await (_db.delete(_db.contentDocuments)..where((t) => t.contentId.equals(id))).go();
          }
        } else if (type == 'content_item') {
          for (final id in ids) {
             await (_db.delete(_db.contentItems)..where((t) => t.id.equals(id))).go();
          }
        } else if (type == 'category') {
          for (final id in ids) {
             await (_db.delete(_db.categories)..where((t) => t.id.equals(id))).go();
          }
        }
      }
    });

    // Process Upserts (Network Calls Outside DB Transaction)
    if (hasUpserts || deletionsByType.isEmpty && cursorRecord == null) {
      final catRes = await _apiClient.client.get('/domains/$domainId/categories');
      final categories = catRes.data as List<dynamic>;
      
      List<Map<String, dynamic>> fetchedCategories = [];
      List<Map<String, dynamic>> fetchedContentItems = [];
      List<Map<String, dynamic>> fetchedDocuments = [];

      for (final catObj in categories) {
        final cat = catObj as Map<String, dynamic>;
        fetchedCategories.add(cat);

        final contentRes = await _apiClient.client.get('/categories/${cat['id']}/content');
        final contentData = contentRes.data as Map<String, dynamic>;
        final items = contentData['items'] as List<dynamic>? ?? [];
        
        for (final itemObj in items) {
          final item = itemObj as Map<String, dynamic>;
          fetchedContentItems.add({'item': item, 'categoryId': cat['id']});
          
          final itemId = item['content_item_id'] ?? item['id'];
          try {
            final docRes = await _apiClient.client.get('/content/$itemId');
            final docData = docRes.data as Map<String, dynamic>;
            fetchedDocuments.add({'id': docData['id'], 'content_item_id': docData['content_item_id'], 'blocks': docData['blocks'], 'published_at': docData['published_at']});
          } catch (e) {
            // Ignore missing documents
          }
        }
      }

      await _db.transaction(() async {
        for (final cat in fetchedCategories) {
          await _db.into(_db.categories).insertOnConflictUpdate(CategoriesCompanion.insert(
            id: cat['id'],
            domainId: domainId,
            title: cat['name'],
            description: Value(cat['description']),
            sortOrder: cat['sort_order'],
            updatedAt: DateTime.now(),
          ));
        }

        for (final map in fetchedContentItems) {
          final item = map['item'] as Map<String, dynamic>;
          final practiceResource = item['primary_practice_resource'] as Map<String, dynamic>?;
          
          await _db.into(_db.contentItems).insertOnConflictUpdate(ContentItemsCompanion.insert(
            id: item['content_item_id'] ?? item['id'],
            categoryId: map['categoryId'],
            title: item['title'],
            slug: item['slug'],
            type: item['type'] ?? 'concept',
            difficulty: Value(item['difficulty']),
            sortOrder: item['sort_order'] ?? 0,
            primaryPracticeUrl: Value(practiceResource != null ? practiceResource['practice_url'] : null),
            updatedAt: DateTime.now(),
          ));
        }

        for (final doc in fetchedDocuments) {
          await _db.into(_db.contentDocuments).insertOnConflictUpdate(ContentDocumentsCompanion.insert(
            id: doc['id'],
            contentId: doc['content_item_id'],
            blocksJson: jsonEncode(doc['blocks']),
            publishedAt: DateTime.parse(doc['published_at']).toLocal(),
          ));
        }

        if (cursor.isNotEmpty) {
          await _db.into(_db.syncCursors).insertOnConflictUpdate(SyncCursorsCompanion.insert(
            id: cursorId,
            cursorValue: cursor,
            updatedAt: DateTime.now(),
          ));
        }
      });
    } else if (cursor.isNotEmpty) {
      // If no upserts and no deletions, just save cursor
      await _db.into(_db.syncCursors).insertOnConflictUpdate(SyncCursorsCompanion.insert(
        id: cursorId,
        cursorValue: cursor,
        updatedAt: DateTime.now(),
      ));
    }
  }

  Future<void> _pullUserChanges() async {
    const cursorId = 'user';
    final cursorRecord = await (_db.select(_db.syncCursors)..where((t) => t.id.equals(cursorId))).getSingleOrNull();
    String cursor = cursorRecord?.cursorValue ?? '';

    final deviceState = await (_db.select(_db.deviceState)..where((t) => t.id.equals('current'))).getSingleOrNull();
    if (deviceState == null) return;

    bool hasMoreChanges = true;
    bool hasUpserts = false;
    Map<String, List<String>> deletionsByType = {};

    while (hasMoreChanges) {
      final response = await _apiClient.client.get('/sync/user', queryParameters: {
        'device_id': deviceState.deviceId,
        if (cursor.isNotEmpty) 'after': cursor,
      });

      final data = response.data as Map<String, dynamic>;
      final changes = data['changes'] as List<dynamic>? ?? [];
      
      for (final changeObj in changes) {
        final change = changeObj as Map<String, dynamic>;
        final op = change['operation'] as String;
        final entityType = change['entity_type'] as String;
        final entityId = change['entity_id'] as String;
        
        if (op == 'delete') {
          deletionsByType.putIfAbsent(entityType, () => []).add(entityId);
        } else {
          hasUpserts = true;
        }
      }
      
      cursor = data['next_cursor']?.toString() ?? cursor;
      hasMoreChanges = data['has_more'] == true;
    }

    await _db.transaction(() async {
      for (final entry in deletionsByType.entries) {
        final type = entry.key;
        final ids = entry.value;
        if (type == 'progress') {
          for (final id in ids) {
             await (_db.delete(_db.userProgress)..where((t) => t.contentId.equals(id))).go();
          }
        } else if (type == 'bookmark') {
          for (final id in ids) {
             await (_db.delete(_db.bookmarks)..where((t) => t.contentId.equals(id))).go();
          }
        } else if (type == 'note') {
          for (final id in ids) {
             await (_db.delete(_db.userNotes)..where((t) => t.id.equals(id))).go();
          }
        } else if (type == 'review_card') {
          for (final id in ids) {
             await (_db.delete(_db.reviewCards)..where((t) => t.id.equals(id))).go();
          }
        }
      }
    });

    if (hasUpserts || deletionsByType.isEmpty && cursorRecord == null) {
      // 1. Fetch Progress
      List<Map<String, dynamic>> allProgress = [];
      int page = 1;
      bool morePages = true;
      while (morePages) {
        final res = await _apiClient.client.get('/me/progress', queryParameters: {'page': page, 'page_size': 100});
        final data = res.data as Map<String, dynamic>;
        final items = data['items'] as List<dynamic>? ?? [];
        allProgress.addAll(items.cast<Map<String, dynamic>>());
        final pagination = data['pagination'] as Map<String, dynamic>;
        morePages = page < (pagination['total_pages'] as int);
        page++;
      }

      // 2. Fetch Bookmarks
      List<Map<String, dynamic>> allBookmarks = [];
      page = 1;
      morePages = true;
      while (morePages) {
        final res = await _apiClient.client.get('/me/bookmarks', queryParameters: {'page': page, 'page_size': 100});
        final data = res.data as Map<String, dynamic>;
        final items = data['items'] as List<dynamic>? ?? [];
        allBookmarks.addAll(items.cast<Map<String, dynamic>>());
        final pagination = data['pagination'] as Map<String, dynamic>;
        morePages = page < (pagination['total_pages'] as int);
        page++;
      }

      // 3. Fetch Notes
      List<Map<String, dynamic>> allNotes = [];
      page = 1;
      morePages = true;
      while (morePages) {
        final res = await _apiClient.client.get('/me/notes', queryParameters: {'page': page, 'page_size': 100});
        final data = res.data as Map<String, dynamic>;
        final items = data['items'] as List<dynamic>? ?? [];
        allNotes.addAll(items.cast<Map<String, dynamic>>());
        final pagination = data['pagination'] as Map<String, dynamic>;
        morePages = page < (pagination['total_pages'] as int);
        page++;
      }
      
      // 4. Fetch Due Reviews (Only Due)
      List<Map<String, dynamic>> allDueReviews = [];
      try {
        final res = await _apiClient.client.get('/me/reviews/due');
        final data = res.data as Map<String, dynamic>;
        final items = data['items'] as List<dynamic>? ?? [];
        allDueReviews.addAll(items.cast<Map<String, dynamic>>());
      } catch(e) {
        // Ignore if endpoint is empty
      }

      await _db.transaction(() async {
        for (final p in allProgress) {
          await _db.into(_db.userProgress).insertOnConflictUpdate(UserProgressCompanion.insert(
            contentId: p['content_item_id'],
            status: p['status'],
            rowVersion: p['row_version'] ?? 0,
            updatedAt: DateTime.now(),
          ));
        }

        for (final b in allBookmarks) {
          await _db.into(_db.bookmarks).insertOnConflictUpdate(BookmarksCompanion.insert(
            contentId: b['content_item_id'],
            createdAt: DateTime.now(),
          ));
        }

        for (final n in allNotes) {
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
        
        for (final r in allDueReviews) {
          await _db.into(_db.reviewCards).insertOnConflictUpdate(ReviewCardsCompanion.insert(
            id: r['id'],
            contentId: r['content_item_id'],
            state: 'due',
            nextReviewAt: Value(DateTime.parse(r['next_review_at']).toLocal()),
            rowVersion: r['row_version'] ?? 1,
          ));
        }

        if (cursor.isNotEmpty) {
          await _db.into(_db.syncCursors).insertOnConflictUpdate(SyncCursorsCompanion.insert(
            id: cursorId,
            cursorValue: cursor,
            updatedAt: DateTime.now(),
          ));
        }
      });
    } else if (cursor.isNotEmpty) {
      // If no upserts and no deletions, just save cursor
      await _db.into(_db.syncCursors).insertOnConflictUpdate(SyncCursorsCompanion.insert(
        id: cursorId,
        cursorValue: cursor,
        updatedAt: DateTime.now(),
      ));
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

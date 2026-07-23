import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:package_info_plus/package_info_plus.dart';
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
        _endSync(SyncResult.authRequired);
        return SyncResult.authRequired;
      }
      if (type == SyncErrorType.offline) {
        _endSync(SyncResult.offline);
        return SyncResult.offline;
      }
      AppLogger.recordError(e, stack, reason: 'Registration/Recovery failed');
      _endSync(SyncResult.serverFailure);
      return SyncResult.serverFailure;
    }

    try {
      await _pushMutations();
    } catch (e, stack) {
      final type = ApiErrorHandler.classify(e);
      if (type == SyncErrorType.authRequired) {
        _endSync(SyncResult.authRequired);
        return SyncResult.authRequired;
      }
      if (type == SyncErrorType.offline) {
        _endSync(SyncResult.offline);
        return SyncResult.offline;
      }
      if (type == SyncErrorType.serverFailure) {
        _endSync(SyncResult.serverFailure);
        return SyncResult.serverFailure;
      }
      AppLogger.recordError(e, stack, reason: 'Push mutations failed');
      hasPartialFailure = true;
    }

    try {
      await _pullCatalogChanges('dsa'); // Assuming 'dsa' is the initial domain
    } catch (e, stack) {
      final type = ApiErrorHandler.classify(e);
      if (type == SyncErrorType.authRequired) {
        _endSync(SyncResult.authRequired);
        return SyncResult.authRequired;
      }
      if (type == SyncErrorType.offline) {
        _endSync(SyncResult.offline);
        return SyncResult.offline;
      }
      if (type == SyncErrorType.serverFailure) {
        _endSync(SyncResult.serverFailure);
        return SyncResult.serverFailure;
      }
      AppLogger.recordError(e, stack, reason: 'Pull catalog changes failed');
      hasPartialFailure = true;
    }

    try {
      await _pullUserChanges();
    } catch (e, stack) {
      final type = ApiErrorHandler.classify(e);
      if (type == SyncErrorType.authRequired) {
        _endSync(SyncResult.authRequired);
        return SyncResult.authRequired;
      }
      if (type == SyncErrorType.offline) {
        _endSync(SyncResult.offline);
        return SyncResult.offline;
      }
      if (type == SyncErrorType.serverFailure) {
        _endSync(SyncResult.serverFailure);
        return SyncResult.serverFailure;
      }
      AppLogger.recordError(e, stack, reason: 'Pull user changes failed');
      hasPartialFailure = true;
    }

    final finalResult = hasPartialFailure ? SyncResult.partialFailure : SyncResult.success;
    _endSync(finalResult);
    return finalResult;
  }

  void _endSync(SyncResult result) {
    _isSyncing = false;
    
    // Map SyncResult to SyncStatus
    SyncStatus status = SyncStatus.upToDate;
    switch (result) {
      case SyncResult.success:
        status = SyncStatus.upToDate;
        break;
      case SyncResult.partialFailure:
        status = SyncStatus.partialFailure;
        break;
      case SyncResult.serverFailure:
        status = SyncStatus.serverFailure;
        break;
      case SyncResult.offline:
        status = SyncStatus.offline;
        break;
      case SyncResult.authRequired:
        status = SyncStatus.authenticationRequired;
        break;
    }
    
    _ref.read(syncStatusProvider.notifier).setResult(status);
  }

  Future<void> _recoverProcessingMutations() async {
    await (_db.update(_db.localOutbox)..where((t) => t.status.equals('processing')))
        .write(const LocalOutboxCompanion(status: Value('pending')));
  }

  Future<void> _ensureDeviceRegistered() async {
    final state = await (_db.select(_db.deviceState)..where((t) => t.id.equals('current'))).getSingleOrNull();
    if (state != null) return;

    final platformStr = Platform.isAndroid ? 'android' : Platform.isIOS ? 'ios' : 'web';
    final packageInfo = await PackageInfo.fromPlatform();
    
    try {
      final response = await _apiClient.client.post('/devices/register', data: {
        'device_name': 'RecallStack Mobile',
        'platform': platformStr,
        'app_version': packageInfo.version,
      });
      final responseData = response.data as Map<String, dynamic>;
      final deviceId = responseData['id'] as String;
      
      await _db.into(_db.deviceState).insert(DeviceStateCompanion.insert(
        id: 'current',
        deviceId: deviceId,
        registeredAt: DateTime.now(),
      ));
    } catch (e) {
      final type = ApiErrorHandler.classify(e);
      if (type == SyncErrorType.authRequired || type == SyncErrorType.offline || type == SyncErrorType.serverFailure) {
        rethrow;
      }
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
    
    final validMutations = <LocalOutboxData>[];
    final invalidMutationReasons = <String, String>{}; // mId -> reason
    final payload = <Map<String, dynamic>>[];

    for (final m in pendingMutations) {
      String operation;
      Map<String, dynamic> mappedPayload;
      
      try {
        final decoded = jsonDecode(m.payloadJson);
        if (decoded is! Map<String, dynamic>) {
          invalidMutationReasons[m.mutationId] = 'invalid_mutation_payload_shape';
          continue;
        }
        mappedPayload = decoded;
      } catch (e) {
        invalidMutationReasons[m.mutationId] = 'malformed_mutation_payload';
        continue;
      }

      if (m.entityType == 'bookmark') {
        if (m.mutationType == 'insert_bookmark') {
          operation = 'insert';
        } else if (m.mutationType == 'delete_bookmark') {
          operation = 'delete';
        } else {
          invalidMutationReasons[m.mutationId] = 'unknown_mutation_type';
          continue;
        }
        mappedPayload = {}; // Do not send payload for bookmarks
      } else if (m.entityType == 'practice_attempt') {
        if (m.mutationType == 'practice_attempt') {
          operation = 'insert';
        } else {
          invalidMutationReasons[m.mutationId] = 'unknown_mutation_type';
          continue;
        }
      } else if (m.entityType == 'review') {
        if (m.mutationType == 'review_card') {
          operation = 'insert';
        } else {
          invalidMutationReasons[m.mutationId] = 'unknown_mutation_type';
          continue;
        }
      } else if (m.entityType == 'note') {
        if (m.mutationType == 'save_note') {
          operation = 'insert';
        } else if (m.mutationType == 'update_note') {
          operation = 'update';
        } else if (m.mutationType == 'delete_note') {
          operation = 'delete';
        } else {
          invalidMutationReasons[m.mutationId] = 'unknown_mutation_type';
          continue;
        }
      } else if (m.entityType == 'progress') {
        if (m.mutationType == 'update_progress') {
          operation = 'update';
        } else {
          invalidMutationReasons[m.mutationId] = 'unknown_mutation_type';
          continue;
        }
      } else {
        invalidMutationReasons[m.mutationId] = 'unknown_mutation_type';
        continue;
      }

      validMutations.add(m);
      payload.add({
        'mutation_id': m.mutationId,
        'entity_type': m.entityType,
        'entity_id': m.entityId,
        'operation': operation,
        'payload': mappedPayload,
      });
    }

    if (invalidMutationReasons.isNotEmpty) {
      await _db.transaction(() async {
        for (final entry in invalidMutationReasons.entries) {
          await (_db.update(_db.localOutbox)..where((t) => t.mutationId.equals(entry.key)))
            .write(LocalOutboxCompanion(
              status: const Value('rejected'),
              lastError: Value(entry.value),
            ));
        }
      });
    }

    if (payload.isEmpty) return;

    final submittedMutationIds = validMutations.map((m) => m.mutationId).toSet();

    try {
      final response = await _apiClient.client.post('/sync/mutations/batch', data: {
        'device_id': deviceState.deviceId,
        'mutations': payload,
      });

      final responseData = response.data as Map<String, dynamic>;
      final results = (responseData['results'] as List<dynamic>?)?.cast<Map<String, dynamic>>() ?? <Map<String, dynamic>>[];
      
      final validReturnedMutationIds = <String>{};

      await _db.transaction(() async {
        for (final result in results) {
          if (result is! Map<String, dynamic>) continue;
          
          final mId = result['mutation_id'];
          if (mId is! String) continue;

          if (!submittedMutationIds.contains(mId)) {
            continue; // Ignore unknown IDs to prevent arbitrary outbox modification
          }
          if (validReturnedMutationIds.contains(mId)) {
            continue; // Duplicate returned ID, process only once
          }

          final status = result['status']; 
          if (status is! String) continue; // If status missing/wrong type, skip (becomes missing)

          validReturnedMutationIds.add(mId); // Now it's safely valid

          final errorMessage = result['error_code'] as String?; // Backend sends error_code

          if (status == 'applied' || status == 'duplicate') {
            await (_db.delete(_db.localOutbox)..where((t) => t.mutationId.equals(mId))).go();
          } else {
            if (status == 'rejected' || status == 'conflict') {
              await (_db.update(_db.localOutbox)..where((t) => t.mutationId.equals(mId)))
                .write(LocalOutboxCompanion(
                  status: Value(status), // rejected or conflict
                  lastError: Value(errorMessage),
                ));
            } else {
              // If backend returned malformed/unknown status, treat it as rejected
              await (_db.update(_db.localOutbox)..where((t) => t.mutationId.equals(mId)))
                .write(const LocalOutboxCompanion(
                  status: Value('rejected'),
                  lastError: Value('invalid_status_from_server'),
                ));
            }
          }
        }

        // Handle missing mutations (submitted but not in response)
        final missingMutationIds = submittedMutationIds.difference(validReturnedMutationIds);
        for (final mId in missingMutationIds) {
          final m = pendingMutations.firstWhere((p) => p.mutationId == mId);
          final nextRetry = m.retryCount + 1;
          final delaySeconds = (1 << (nextRetry > 12 ? 12 : nextRetry));
          
          await (_db.update(_db.localOutbox)..where((t) => t.mutationId.equals(mId)))
            .write(LocalOutboxCompanion(
              status: const Value('retryable'),
              retryCount: Value(nextRetry),
              nextRetryAt: Value(DateTime.now().add(Duration(seconds: delaySeconds))),
              lastError: const Value('missing_batch_result'),
            ));
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
                status: Value(type == SyncErrorType.conflict ? 'conflict' : 'rejected'),
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

    // Fetch Upserts (Network Calls Outside DB Transaction)
    List<Map<String, dynamic>> fetchedCategories = [];
    List<Map<String, dynamic>> fetchedContentItems = [];
    List<Map<String, dynamic>> fetchedDocuments = [];

    if (hasUpserts || deletionsByType.isEmpty && cursorRecord == null) {
      final catRes = await _apiClient.client.get('/domains/$domainId/categories');
      final categories = catRes.data as List<dynamic>;
      
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
            final type = ApiErrorHandler.classify(e);
            if (type == SyncErrorType.authRequired || type == SyncErrorType.offline || type == SyncErrorType.serverFailure) {
              rethrow; // Abort sync, do not advance cursor
            }
            // If it's a 404 (permanentFailure conceptually here if we strictly check), we ignore it.
            // A more strict check for 404 would be:
            if (e is DioException && e.response?.statusCode == 404) {
               continue; // verified 404
            }
            rethrow; // Do not swallow other malformed responses or 500s
          }
        }
      }
    }

    // Process Deletions, Upserts, and Cursor update ATOMICALLY
    await _db.transaction(() async {
      // 1. Process Deletions
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

      // 2. Process Upserts
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

      // 3. Save Cursor
      if (cursor.isNotEmpty) {
        await _db.into(_db.syncCursors).insertOnConflictUpdate(SyncCursorsCompanion.insert(
          id: cursorId,
          cursorValue: cursor,
          updatedAt: DateTime.now(),
        ));
      }
    });
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

    // Fetch Upserts (Network Calls Outside DB Transaction)
    List<Map<String, dynamic>> allProgress = [];
    List<Map<String, dynamic>> allBookmarks = [];
    List<Map<String, dynamic>> allNotes = [];
    List<Map<String, dynamic>> allDueReviews = [];

    if (hasUpserts || deletionsByType.isEmpty && cursorRecord == null) {
      // 1. Fetch Progress
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
      page = 1;
      morePages = true;
      while (morePages) {
        try {
          final res = await _apiClient.client.get('/me/reviews/due', queryParameters: {'page': page, 'page_size': 100});
          final data = res.data as Map<String, dynamic>;
          final items = data['items'] as List<dynamic>? ?? [];
          allDueReviews.addAll(items.cast<Map<String, dynamic>>());
          final pagination = data['pagination'] as Map<String, dynamic>;
          morePages = page < (pagination['total_pages'] as int);
          page++;
        } catch(e) {
          final type = ApiErrorHandler.classify(e);
          if (type == SyncErrorType.authRequired || type == SyncErrorType.offline || type == SyncErrorType.serverFailure) {
            rethrow; // Abort sync, do not advance cursor
          }
          if (e is DioException && e.response?.statusCode == 404) {
             morePages = false; // verified 404
          } else {
            rethrow; // Do not swallow other malformed responses or 500s
          }
        }
      }
    }

    // Process Deletions, Upserts, and Cursor ATOMICALLY
    await _db.transaction(() async {
      // 1. Process Deletions
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

      // 2. Process Upserts
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

      // 3. Save Cursor
      if (cursor.isNotEmpty) {
        await _db.into(_db.syncCursors).insertOnConflictUpdate(SyncCursorsCompanion.insert(
          id: cursorId,
          cursorValue: cursor,
          updatedAt: DateTime.now(),
        ));
      }
    });
  }

  Future<void> _handleFullResync(String domainId) async {
    final deviceState = await (_db.select(_db.deviceState)..where((t) => t.id.equals('current'))).getSingleOrNull();
    if (deviceState == null) return;

    // 1. Fetch entire catalog into memory FIRST
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
          final type = ApiErrorHandler.classify(e);
          if (type == SyncErrorType.authRequired || type == SyncErrorType.offline || type == SyncErrorType.serverFailure) {
            rethrow; // Abort sync
          }
          if (e is DioException && e.response?.statusCode == 404) {
             continue; // verified 404
          }
          rethrow;
        }
      }
    }

    // 1.5 Fetch the new cursor state to ensure we have a valid sync contract post-resync
    String? newCursor;
    try {
      bool hasMore = true;
      String? currentCursor;

      while (hasMore) {
        final cursorRes = await _apiClient.client.get('/sync/catalog/$domainId', queryParameters: {
          'device_id': deviceState.deviceId,
          if (currentCursor != null) 'after': currentCursor,
        });
        
        final cursorData = cursorRes.data as Map<String, dynamic>;
        
        if (cursorData['full_resync_required'] == true) {
          throw Exception('FULL RESYNC TERMINAL CURSOR BLOCKED BY EXISTING BACKEND CONTRACT');
        }

        currentCursor = cursorData['next_cursor']?.toString() ?? currentCursor;
        hasMore = cursorData['has_more'] == true;
      }
      
      newCursor = currentCursor;
      
      if (newCursor == null || newCursor.isEmpty) {
        throw Exception('Failed to obtain a valid terminal cursor from backend');
      }
    } catch (e) {
      final type = ApiErrorHandler.classify(e);
      if (type == SyncErrorType.authRequired || type == SyncErrorType.offline || type == SyncErrorType.serverFailure) {
        rethrow;
      }
      rethrow;
    }

    // 2. Safely perform replacement inside one atomic transaction
    await _db.transaction(() async {
      await _db.delete(_db.contentDocuments).go();
      await _db.delete(_db.contentItems).go();
      await _db.delete(_db.categories).go();
      await (_db.delete(_db.syncCursors)..where((t) => t.id.equals('catalog_$domainId'))).go();

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

      if (newCursor != null && newCursor.isNotEmpty) {
        await _db.into(_db.syncCursors).insertOnConflictUpdate(SyncCursorsCompanion.insert(
          id: 'catalog_$domainId',
          cursorValue: newCursor,
          updatedAt: DateTime.now(),
        ));
      }
    });
  }
}

final syncEngineProvider = Provider<SyncEngine>((ref) {
  return SyncEngine(ref.watch(apiClientProvider), ref.watch(appDatabaseProvider), ref);
});

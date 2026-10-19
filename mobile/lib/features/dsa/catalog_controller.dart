import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'canonical_api.dart';
import 'canonical_models.dart';

class CatalogController extends ChangeNotifier {
  CatalogController(this.api);
  final CanonicalDsaApi api;
  List<Problem> problems = [];
  List<Json> categories = [], companies = [];
  Map<String, Json> progress = {};
  Set<String> bookmarks = {};
  String search = '', company = '', completion = 'all';
  String? difficulty, category, cursor;
  bool busy = false, hasMore = false, metadataBusy = false, disposed = false;
  Object? error, metadataError;
  CancelToken? _token;
  int _generation = 0;
  void emit() {
    if (!disposed) notifyListeners();
  }

  Future<void> load({bool more = false}) async {
    if (disposed || (more && (busy || !hasMore))) return;
    if (!more) {
      _token?.cancel();
      _generation++;
      problems = [];
      companies = [];
      cursor = null;
    }
    final generation = _generation, previous = cursor;
    final token = _token = CancelToken();
    busy = true;
    error = null;
    emit();
    try {
      final page = await api.catalog(
        search: search,
        category: category,
        difficulty: difficulty,
        cursor: more ? cursor : null,
        token: token,
      );
      if (disposed || generation != _generation || token.isCancelled) return;
      if (more && page.hasMore && page.cursor == previous) {
        throw const FormatException('Repeated catalog cursor.');
      }
      final seen = problems.map((p) => p.id).toSet();
      if (page.items.any((p) => seen.contains(p.id))) {
        throw const FormatException('Catalog changed; refresh to continue.');
      }
      problems = [...problems, ...page.items];
      cursor = page.cursor;
      hasMore = page.hasMore;
      // Company metadata is public and bounded to this page; no problem specs.
      if (page.items.isNotEmpty) {
        try {
          final tags = await api.companies(page.items, token: token);
          if (!disposed && generation == _generation) {
            companies = [...companies, ...tags];
          }
        } catch (e) {
          if (!token.isCancelled && !disposed && generation == _generation) {
            metadataError = e;
          }
        }
      }
    } catch (e) {
      if (!disposed && generation == _generation && !token.isCancelled) {
        error = e;
      }
    } finally {
      if (!disposed && generation == _generation) {
        busy = false;
        emit();
      }
    }
  }

  Future<void> loadAll() async {
    for (var i = 0; i < 100 && hasMore && !disposed && !busy; i++) {
      await load(more: true);
      if (error != null) return;
    }
  }

  Future<void> loadMetadata() async {
    metadataBusy = true;
    metadataError = null;
    emit();
    try {
      final values = await Future.wait([
        api.categories(),
        api.progress(),
        api.bookmarks(),
      ]);
      if (disposed) return;
      categories = values[0] as List<Json>;
      progress = {
        for (final p in values[1] as List<Json>) string(p, 'problemId'): p,
      };
      bookmarks = values[2] as Set<String>;
    } catch (e) {
      if (!disposed) metadataError = e;
    } finally {
      if (!disposed) {
        metadataBusy = false;
        emit();
      }
    }
  }

  List<Problem> get visible => problems.where((p) {
    final state = progress[p.id];
    final status = state != null && state['problemVersionId'] == p.version
        ? state['executionStatus']
        : null;
    return (company.isEmpty ||
            companies.any(
              (c) => c['problemVersionId'] == p.version && c['slug'] == company,
            )) &&
        (completion == 'all' ||
            (completion == 'bookmarked'
                ? bookmarks.contains(p.id)
                : completion == 'unsolved'
                ? !{'solved', 'passed_current_tests'}.contains(status)
                : status == completion));
  }).toList();
  Future<void> toggleBookmark(Problem p) async {
    final target = !bookmarks.contains(p.id);
    await api.bookmark(p.id, target);
    if (disposed) return;
    if (target) {
      bookmarks.add(p.id);
    } else {
      bookmarks.remove(p.id);
    }
    emit();
  }

  @override
  void dispose() {
    disposed = true;
    _generation++;
    _token?.cancel();
    super.dispose();
  }
}

final catalogControllerProvider = Provider.autoDispose<CatalogController>((
  ref,
) {
  final controller = CatalogController(ref.watch(canonicalDsaApiProvider));
  ref.onDispose(controller.dispose);
  Future.microtask(() async {
    await Future.wait([controller.load(), controller.loadMetadata()]);
  });
  return controller;
});
String completionLabel(Json? value, String version) {
  if (value == null) return 'Not started';
  final status = value['problemVersionId'] == version
      ? value['executionStatus']
      : null;
  const labels = {
    'solved': 'Solved',
    'passed_current_tests': 'Passed current tests',
    'attempted': 'Attempted',
    'queued': 'Queued',
    'running': 'Judging',
    'cancelled': 'Cancelled',
    'execution_failed': 'Execution failed',
  };
  final learning = value['learningStatus'] as String? ?? 'new';
  return '${labels[status] ?? (learning == 'new' ? 'Not started' : learning)}${value['previousVersionPassed'] == true ? ' · Passed earlier version' : ''}';
}

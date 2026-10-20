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
  Object? error, progressError, companyError, bookmarksError, categoriesError;
  Object? get metadataError =>
      progressError ?? companyError ?? bookmarksError ?? categoriesError;
  String get metadataWarning => [
    if (progressError != null)
      'Progress could not refresh. Displayed progress may be out of date.',
    if (companyError != null)
      'Some company tags could not load. Company matches may be incomplete.',
    if (bookmarksError != null) 'Bookmarks could not refresh.',
    if (categoriesError != null) 'Categories could not refresh.',
  ].join('\n');
  bool companyRetryBusy = false, progressBusy = false;
  bool get retryBusy => metadataBusy || companyRetryBusy;
  final _companyIndex = <String, List<Json>>{};
  final _failedCompanies = <String, Problem>{};
  final _bookmarkPending = <String>{};
  CancelToken? _token, _metadataToken, _companyRetryToken;
  int _generation = 0, _metadataGeneration = 0, _bookmarkRevision = 0;
  List<Json> companiesFor(Problem p) => _companyIndex[p.version] ?? const [];
  bool bookmarkPending(Problem p) => _bookmarkPending.contains(p.id);
  void emit() {
    if (!disposed) notifyListeners();
  }

  Future<void> load({bool more = false}) async {
    if (disposed || (more && (busy || !hasMore))) return;
    if (!more) {
      _token?.cancel();
      _companyRetryToken?.cancel();
      _generation++;
      problems = [];
      companies = [];
      _companyIndex.clear();
      _failedCompanies.clear();
      companyRetryBusy = false;
      companyError = null;
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
      emit(); // Show the catalog before optional company metadata arrives.
      // Company metadata is public and bounded to this page; no problem specs.
      if (page.items.isNotEmpty) {
        try {
          final tags = await api.companies(page.items, token: token);
          if (!disposed && generation == _generation && !token.isCancelled) {
            _applyCompanies(page.items, tags);
          }
        } catch (e) {
          if (!token.isCancelled && !disposed && generation == _generation) {
            companyError = e;
            for (final p in page.items) {
              _failedCompanies[p.version] = p;
            }
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

  void _applyCompanies(List<Problem> page, List<Json> tags) {
    final versions = page.map((p) => p.version).toSet();
    final index = <String, Map<String, Json>>{};
    for (final tag in tags) {
      final version = string(tag, 'problemVersionId');
      if (versions.contains(version)) {
        (index[version] ??= {})[string(tag, 'slug')] = tag;
      }
    }
    for (final version in versions) {
      _companyIndex[version] = index[version]?.values.toList() ?? [];
      _failedCompanies.remove(version);
    }
    companies = _companyIndex.values.expand((tags) => tags).toList();
    if (_failedCompanies.isEmpty) companyError = null;
  }

  Future<void> _retryCompanies() async {
    if (disposed || companyRetryBusy || _failedCompanies.isEmpty) return;
    final generation = _generation;
    final token = _companyRetryToken = CancelToken();
    final pending = _failedCompanies.values.toList();
    companyRetryBusy = true;
    emit();
    bool active() =>
        !disposed && generation == _generation && !token.isCancelled;
    try {
      // Retry only missing versions in the same bounded batches as the catalog.
      for (var offset = 0; offset < pending.length; offset += 50) {
        if (!active()) return;
        final page = pending.skip(offset).take(50).toList();
        try {
          final tags = await api.companies(page, token: token);
          if (!active()) return;
          _applyCompanies(page, tags);
        } catch (e) {
          if (!active()) return;
          companyError = e;
        }
      }
    } finally {
      if (active()) {
        companyRetryBusy = false;
        emit();
      }
    }
  }

  Future<void> retryMetadata() async {
    if (disposed || retryBusy) return;
    await Future.wait([
      if (progressError != null ||
          bookmarksError != null ||
          categoriesError != null)
        loadMetadata(onlyFailed: true),
      _retryCompanies(),
    ]);
  }

  Future<void> loadAll() async {
    for (var i = 0; i < 100 && hasMore && !disposed && !busy; i++) {
      await load(more: true);
      if (error != null) return;
    }
  }

  Future<void> loadMetadata({bool onlyFailed = false}) async {
    if (disposed) return;
    final readCategories = !onlyFailed || categoriesError != null;
    final readProgress = !onlyFailed || progressError != null;
    final readBookmarks = !onlyFailed || bookmarksError != null;
    _metadataToken?.cancel();
    final token = _metadataToken = CancelToken();
    final current = ++_metadataGeneration;
    final bookmarkRevision = _bookmarkRevision;
    metadataBusy = true;
    progressBusy = readProgress;
    emit();
    bool active() =>
        !disposed && current == _metadataGeneration && !token.isCancelled;
    // Optional failures must not erase successful progress or bookmark responses.
    Future<void> read<T>(
      Future<T> request,
      void Function(T) apply,
      void Function(Object) fail,
    ) async {
      try {
        final value = await request;
        if (active()) apply(value);
      } catch (e) {
        if (active()) fail(e);
      }
      if (active()) emit();
    }

    await Future.wait([
      if (readCategories)
        read(api.categories(token: token), (value) {
          categories = value;
          categoriesError = null;
        }, (e) => categoriesError = e),
      if (readProgress)
        read(api.progress(token: token), (value) {
          progress = {for (final p in value) string(p, 'problemId'): p};
          progressError = null;
        }, (e) => progressError = e),
      if (readBookmarks)
        read(api.bookmarks(token: token), (value) {
          if (bookmarkRevision == _bookmarkRevision &&
              _bookmarkPending.isEmpty) {
            bookmarks = value;
            bookmarksError = null;
          }
        }, (e) => bookmarksError = e),
    ]);
    if (active()) {
      metadataBusy = false;
      progressBusy = false;
      emit();
    }
  }

  List<Problem> get visible => problems.where((p) {
    final state = progress[p.id];
    final status = state != null && state['problemVersionId'] == p.version
        ? state['executionStatus']
        : null;
    return (company.isEmpty ||
            companiesFor(p).any(
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
    if (!_bookmarkPending.add(p.id)) return;
    _bookmarkRevision++;
    emit();
    final target = !bookmarks.contains(p.id);
    try {
      await api.bookmark(p.id, target);
      if (disposed) return;
      if (target) {
        bookmarks.add(p.id);
      } else {
        bookmarks.remove(p.id);
      }
    } finally {
      _bookmarkPending.remove(p.id);
      emit();
    }
  }

  @override
  void dispose() {
    disposed = true;
    _generation++;
    _token?.cancel();
    _metadataToken?.cancel();
    _companyRetryToken?.cancel();
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
  final previous =
      value['previousVersionPassed'] == true ||
      (value['problemVersionId'] != version &&
          {
            'solved',
            'passed_current_tests',
          }.contains(value['executionStatus']));
  return '${labels[status] ?? (learning.isEmpty || learning == 'new' ? 'Not started' : learning[0].toUpperCase() + learning.substring(1))}${previous ? ' · Passed earlier version' : ''}';
}

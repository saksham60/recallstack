import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../../core/api/api_failure.dart';
import '../../core/db/app_database.dart';
import 'canonical_api.dart';
import 'canonical_models.dart';
import '../../core/telemetry/product_telemetry.dart';

/// Local receipts contain a frozen retry request/server ID, never grading truth.
class ExecutionSession extends ChangeNotifier {
  ExecutionSession(
    this.api,
    this.db,
    this.problem, {
    this.onTerminal,
    this.pollDelay = const Duration(seconds: 2),
  });
  final CanonicalDsaApi api;
  final AppDatabase db;
  final Problem problem;
  final void Function()? onTerminal;
  final Duration pollDelay;
  Execution? job;
  Json? pending;
  String? error;
  bool busy = false, pollingStopped = false, _disposed = false, _paused = false;
  int _generation = 0, _polls = 0, _failures = 0;
  String? _notified;
  String? _restoreId;
  CancelToken? _token;
  Timer? _timer;
  String get key => 'execution:${problem.draftKey}';
  bool get active =>
      busy ||
      pending != null ||
      (_restoreId != null && job == null) ||
      (job != null && !job!.terminal);
  void _notify() {
    if (!_disposed) notifyListeners();
  }

  Future<void> restore() async {
    try {
      final record = await db.readRecord(key);
      if (_disposed || record == null) return;
      final value = object(jsonDecode(record));
      if (value['request'] != null) {
        final request = object(value['request']);
        if (request['problemId'] != problem.id ||
            request['problemVersionId'] != problem.version ||
            request['language'] != 'python' ||
            !{'run', 'submit'}.contains(request['mode']) ||
            request['idempotencyKey'] is! String ||
            request['code'] is! String) {
          throw const FormatException('Invalid execution receipt.');
        }
        pending = Map.unmodifiable(request);
        error =
            'An interrupted request is saved. Retry sends the original code and idempotency key.';
      } else if (value['id'] is String) {
        await _fetch(value['id'] as String);
      }
    } catch (e) {
      error = ApiFailure.from(e).userMessage;
    }
    _notify();
  }

  Future<void> start(String code, String mode) async {
    if (active || _disposed) return;
    if (code.trim().isEmpty ||
        code.length > 24000 ||
        !{'run', 'submit'}.contains(mode)) {
      error = 'Enter Python code (up to 24,000 characters).';
      _notify();
      return;
    }
    productEvent(mode == 'submit' ? TelemetryEvent.dsaSubmitInitiated : TelemetryEvent.dsaRunInitiated, entityId: problem.id);
    pending = Map.unmodifiable({
      'problemId': problem.id,
      'problemVersionId': problem.version,
      'language': 'python',
      'code': code,
      'mode': mode,
      'idempotencyKey': const Uuid().v4(),
    });
    await retryCreate();
  }

  Future<void> retryCreate() async {
    if (pending == null || busy || _disposed) return;
    busy = true;
    error = null;
    _notify();
    final current = ++_generation;
    final token = _token = CancelToken();
    try {
      // Persist BEFORE dispatch, so a killed app can retry the exact same request.
      await db.writeRecord(key, jsonEncode({'request': pending}));
      if (_disposed || current != _generation || token.isCancelled) return;
      final result = await api.create(pending!, token: token);
      result.requireScope(problem);
      if (result.mode != pending!['mode']) {
        throw const FormatException('Execution mode mismatch.');
      }
      if (_disposed || current != _generation) return;
      await db.writeRecord(key, jsonEncode({'id': result.id}));
      job = result;
      _restoreId = result.id;
      pending = null;
      _polls = 0;
      _failures = 0;
      pollingStopped = false;
      _accept();
    } catch (e) {
      if (!_disposed && current == _generation) {
        error = ApiFailure.from(e).userMessage;
      }
    } finally {
      if (!_disposed && current == _generation) {
        busy = false;
        _notify();
      }
    }
  }

  Future<void> _fetch(String id) async {
    if (_disposed || _paused) return;
    _restoreId = id;
    final current = ++_generation;
    final token = _token = CancelToken();
    try {
      final result = await api.execution(id, token: token);
      result.requireScope(problem, submissionId: id);
      if (_disposed || current != _generation) return;
      job = result;
      error = null;
      _failures = 0;
      _polls++;
      _accept();
    } catch (e) {
      if (_disposed || current != _generation || token.isCancelled) return;
      final failure = ApiFailure.from(e);
      error = failure.userMessage;
      if (failure.kind == FailureKind.notFound) {
        _restoreId = null;
        pollingStopped = true;
        _notify();
        return;
      }
      _failures++;
      if (_failures < 5 && _polls < 120) {
        _schedule(id);
      } else {
        pollingStopped = true;
      }
    }
    _notify();
  }

  void _accept() {
    if (job!.terminal) {
      _timer?.cancel();
      pollingStopped = false;
      if (job!.mode == 'submit' && _notified != job!.id) {
        _notified = job!.id;
        onTerminal?.call();
      }
    } else if (_polls >= 120) {
      pollingStopped = true;
    } else {
      _schedule(job!.id);
    }
  }

  void _schedule(String id) {
    _timer?.cancel();
    if (!_paused && !_disposed) {
      _timer = Timer(pollDelay * (_failures + 1), () => _fetch(id));
    }
  }

  void pause() {
    _paused = true;
    _timer?.cancel();
    _generation++;
    _token?.cancel();
    busy = false;
  }

  Future<void> resume() async {
    _paused = false;
    _polls = 0;
    _failures = 0;
    pollingStopped = false;
    if (job != null || _restoreId != null) await _fetch(job?.id ?? _restoreId!);
    _notify();
  }

  Future<void> cancel() async {
    if (job == null || job!.terminal || busy) return;
    _timer?.cancel();
    _token?.cancel();
    final current = ++_generation;
    busy = true;
    error = null;
    _notify();
    final token = _token = CancelToken();
    try {
      final result = await api.cancel(job!.id, token: token);
      result.requireScope(problem, submissionId: job!.id);
      if (_disposed || current != _generation) return;
      job = result;
      _accept();
    } catch (e) {
      if (!_disposed && current == _generation) {
        error = ApiFailure.from(e).userMessage;
        _schedule(job!.id);
      }
    } finally {
      if (!_disposed && current == _generation) {
        busy = false;
        _notify();
      }
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _generation++;
    _timer?.cancel();
    _token?.cancel();
    super.dispose();
  }
}

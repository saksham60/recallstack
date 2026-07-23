import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:app/app/router.dart';
import 'package:app/shared/theme/app_theme.dart';
import 'package:app/core/sync/sync_engine.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

class RecallStackApp extends ConsumerStatefulWidget {
  const RecallStackApp({super.key});

  @override
  ConsumerState<RecallStackApp> createState() => _RecallStackAppState();
}

class _RecallStackAppState extends ConsumerState<RecallStackApp> {
  late final AppLifecycleListener _lifecycleListener;
  StreamSubscription? _connectivitySub;

  @override
  void initState() {
    super.initState();
    _lifecycleListener = AppLifecycleListener(onResume: _triggerSync);

    // Initial sync on startup
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _triggerSync();
    });

    _connectivitySub = Connectivity().onConnectivityChanged.listen((results) {
      // Just a trigger. Actual reachability is tested by the SyncEngine HTTP requests.
      if (!results.contains(ConnectivityResult.none)) {
        _triggerSync();
      }
    });
  }

  void _triggerSync() {
    ref.read(syncEngineProvider).runSync();
  }

  @override
  void dispose() {
    _lifecycleListener.dispose();
    _connectivitySub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'RecallStack',
      theme: AppTheme.darkTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.dark,
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}

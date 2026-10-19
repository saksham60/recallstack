import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../app/env.dart';
import '../../../core/api/api_failure.dart';
import '../../../core/auth/auth_repository.dart';
import '../../../core/telemetry/app_logger.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  bool busy = false;
  Future<void> _signIn(Future<void> Function() action) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await action();
    } on AuthException catch (error) {
      AppLogger.error(error);
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
    } catch (error) {
      AppLogger.error(error);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              AppEnv.judgeMode
                  ? 'Authentication failed: $error'
                  : ApiFailure.from(error).userMessage,
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: LayoutBuilder(
        builder: (context, constraints) => SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight: (constraints.maxHeight - 48).clamp(0, double.infinity),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 24),
                Image.asset(
                  'assets/brand/reasonai-1024.png',
                  height: 80,
                  semanticLabel: 'ReasonAI',
                ),
                const SizedBox(height: 20),
                Text(
                  'ReasonAI',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineLarge,
                ),
                const SizedBox(height: 8),
                Text(
                  'Understand what matters. Practice what lasts.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
                const SizedBox(height: 48),
                FilledButton.icon(
                  onPressed: busy
                      ? null
                      : () => _signIn(
                          ref.read(authRepositoryProvider).signInWithGoogle,
                        ),
                  icon: const Icon(Icons.login),
                  label: const Text('Continue with Google'),
                ),
                if (AppEnv.judgeMode) ...[
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: busy
                        ? null
                        : () => _signIn(
                            ref.read(authRepositoryProvider).signInAsJudge,
                          ),
                    icon: const Icon(Icons.bolt),
                    label: const Text('Explore as Hackathon Judge'),
                  ),
                ],
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

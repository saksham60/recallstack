import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../app/env.dart';
import '../../../core/api/api_failure.dart';
import '../../../core/auth/auth_repository.dart';

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
      debugPrint('AUTH ERROR: ${error.message}');
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
    } catch (error, stackTrace) {
      debugPrint('AUTH ERROR: $error\n$stackTrace');
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
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Spacer(),
            Icon(
              Icons.auto_awesome,
              color: Theme.of(context).colorScheme.primary,
              size: 56,
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
            const Spacer(),
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
  );
}

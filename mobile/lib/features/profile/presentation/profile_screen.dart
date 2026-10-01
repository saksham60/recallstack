import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_failure.dart';
import '../../../core/api/safe_url.dart';
import '../../../core/auth/auth_repository.dart';
import '../../../shared/widgets/states.dart';
import '../../feed/presentation/feed_preferences_sheet.dart';

final profileProvider = FutureProvider.autoDispose<Map<String, dynamic>>((
  ref,
) async {
  try {
    final response = await ref.watch(backendDioProvider).get('me');
    return Map<String, dynamic>.from(response.data as Map);
  } catch (e) {
    throw ApiFailure.from(e);
  }
});
final versionProvider = FutureProvider<String>((ref) async {
  final info = await PackageInfo.fromPlatform();
  return '${info.version} (${info.buildNumber})';
});

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(profileProvider);
    final judge = ref.watch(isJudgeSessionProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Me')),
      body: profile.when(
        loading: () => const ListSkeleton(itemHeight: 72),
        error: (e, _) => ErrorState(
          error: e,
          onRetry: () => ref.invalidate(profileProvider),
        ),
        data: (user) {
          final name = (user['display_name'] as String?)?.trim();
          final display = name != null && name.isNotEmpty
              ? name
              : judge
              ? 'Hackathon Judge'
              : 'Learner';
          final avatarUrl = safeHttpUrl(user['avatar_url'] as String?);
          final fallback = CircleAvatar(
            radius: 40,
            child: Text(
              display[0].toUpperCase(),
              style: Theme.of(context).textTheme.headlineLarge,
            ),
          );
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const SizedBox(height: 28),
              Center(
                child: ClipOval(
                  child: SizedBox(
                    width: 80,
                    height: 80,
                    child: avatarUrl == null
                        ? fallback
                        : CachedNetworkImage(
                            imageUrl: avatarUrl.toString(),
                            fit: BoxFit.cover,
                            placeholder: (_, _) => fallback,
                            errorWidget: (_, _, _) => fallback,
                          ),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                display,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              if (judge)
                const Text(
                  'Hackathon Judge Session',
                  textAlign: TextAlign.center,
                ),
              const SizedBox(height: 32),
              ListTile(
                leading: const Icon(Icons.tune),
                title: const Text('Feed personalization'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => openFeedPreferences(context),
              ),
              ListTile(
                leading: const Icon(Icons.info_outline),
                title: const Text('App version'),
                trailing: Text(ref.watch(versionProvider).value ?? '—'),
              ),
              ListTile(
                leading: const Icon(Icons.logout),
                title: const Text('Sign out'),
                onTap: () async {
                  final confirmed = await showDialog<bool>(
                    context: context,
                    builder: (dialog) => AlertDialog(
                      title: const Text('Sign out?'),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(dialog, false),
                          child: const Text('Cancel'),
                        ),
                        FilledButton(
                          onPressed: () => Navigator.pop(dialog, true),
                          child: const Text('Sign out'),
                        ),
                      ],
                    ),
                  );
                  if (confirmed == true) {
                    await ref.read(authRepositoryProvider).signOut();
                  }
                },
              ),
            ],
          );
        },
      ),
    );
  }
}

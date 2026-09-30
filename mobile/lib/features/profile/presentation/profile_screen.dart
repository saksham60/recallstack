import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:app/core/api/api_client.dart';
import 'package:app/core/auth/supabase_auth_repository.dart';
import 'package:app/shared/theme/app_colors.dart';

final profileProvider = FutureProvider.autoDispose<Map<String, dynamic>>((
  ref,
) async {
  final apiClient = ref.watch(apiClientProvider);
  final response = await apiClient.client.get('/me');
  return response.data as Map<String, dynamic>;
});

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(profileProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Me', style: TextStyle(fontWeight: FontWeight.w700, letterSpacing: -0.5)),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout, color: AppColors.danger),
            onPressed: () {
              ref.read(authRepositoryProvider).signOut();
            },
          ),
        ],
      ),
      body: profileAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(child: Text('Error: $err')),
        data: (profile) {
          final displayName =
              profile['display_name'] as String? ?? 'Anonymous User';
          final avatarUrl = profile['avatar_url'] as String?;
          final timezone = profile['timezone'] as String? ?? 'Unknown';
          final roles =
              (profile['roles'] as List<dynamic>?)?.join(', ') ?? 'None';

          return SingleChildScrollView(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const SizedBox(height: 32),
                CircleAvatar(
                  radius: 50,
                  backgroundImage: avatarUrl != null ? NetworkImage(avatarUrl) : null,
                  backgroundColor: AppColors.surfaceElevated,
                  child: avatarUrl == null
                      ? const Icon(Icons.person, size: 50, color: AppColors.textSecondary)
                      : null,
                ),
                const SizedBox(height: 24),
                Text(
                  displayName,
                  style: theme.textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Timezone: $timezone',
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: AppColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Roles: $roles',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: AppColors.textMuted,
                  ),
                ),
                const SizedBox(height: 48),
                Container(
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Column(
                    children: [
                      ListTile(
                        leading: const Icon(Icons.settings, color: AppColors.textSecondary),
                        title: const Text('Settings', style: TextStyle(fontWeight: FontWeight.w600)),
                        trailing: const Icon(Icons.chevron_right, color: AppColors.textMuted),
                        onTap: () {}, // For future expansion
                      ),
                      const Divider(height: 1, color: AppColors.border),
                      ListTile(
                        leading: const Icon(Icons.help_outline, color: AppColors.textSecondary),
                        title: const Text('Help & Support', style: TextStyle(fontWeight: FontWeight.w600)),
                        trailing: const Icon(Icons.chevron_right, color: AppColors.textMuted),
                        onTap: () {}, // For future expansion
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mutation_repository.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(mutationRepository)
final mutationRepositoryProvider = MutationRepositoryProvider._();

final class MutationRepositoryProvider
    extends
        $FunctionalProvider<
          MutationRepository,
          MutationRepository,
          MutationRepository
        >
    with $Provider<MutationRepository> {
  MutationRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'mutationRepositoryProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$mutationRepositoryHash();

  @$internal
  @override
  $ProviderElement<MutationRepository> $createElement(
    $ProviderPointer pointer,
  ) => $ProviderElement(pointer);

  @override
  MutationRepository create(Ref ref) {
    return mutationRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(MutationRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<MutationRepository>(value),
    );
  }
}

String _$mutationRepositoryHash() =>
    r'3737407f175d0621725e84ceeb4aea6eaae79a94';
